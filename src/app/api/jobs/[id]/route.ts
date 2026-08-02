import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fal } from "@/lib/fal/client";
import { falErrorMessage, isFalValidationError } from "@/lib/fal/errors";
import { completeJob, failJob, maybeRunVoiceChain } from "@/lib/jobs/complete";
import { parseJobInput } from "@/lib/jobs/types";
import { parseVoicePlan } from "@/lib/voice/revoice";
import { deleteFromR2 } from "@/lib/r2";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

const OPEN_STATUSES = ["IN_QUEUE", "IN_PROGRESS"] as const;

async function loadJob(id: string) {
  return prisma.job.findUnique({
    where: { id },
    include: {
      assets: true,
      user: { select: { id: true, name: true } },
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiGuard();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  let job = await loadJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  // Non-admins may only view their own jobs (404, not 403, to avoid leaking
  // that a job with this id exists).
  if (gate.role !== "ADMIN" && job.userId !== gate.id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  let queuePosition: number | null = null;
  let liveLogs: unknown = null;

  // Polling fallback: webhooks can't reach localhost, and a missed webhook in
  // prod should not strand a job. Any open job gets a live status check.
  if ((OPEN_STATUSES as readonly string[]).includes(job.status) && job.falRequestId) {
    const { endpoint } = parseJobInput(job.input);
    try {
      const status = await fal.queue.status(endpoint, {
        requestId: job.falRequestId,
        logs: true,
      });

      if (status.status === "COMPLETED") {
        // fal reports COMPLETED even when the generation itself failed — the
        // stored response can be a 422. Surface that as a FAILED job instead
        // of polling forever.
        try {
          const result = await fal.queue.result(endpoint, { requestId: job.falRequestId });
          await completeJob(job.id, result.data);
        } catch (error) {
          if (isFalValidationError(error)) {
            await failJob(job.id, falErrorMessage(error));
          } else {
            throw error;
          }
        }
        job = (await loadJob(id))!;
      } else {
        if ("queue_position" in status && typeof status.queue_position === "number") {
          queuePosition = status.queue_position;
        }
        if ("logs" in status && status.logs) {
          liveLogs = status.logs;
        }
        const mapped = status.status === "IN_PROGRESS" ? "IN_PROGRESS" : "IN_QUEUE";
        if (mapped !== job.status || liveLogs) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: mapped,
              ...(liveLogs ? { logs: liveLogs as Prisma.InputJsonValue } : {}),
            },
          });
          job = (await loadJob(id))!;
        }
      }
    } catch (error) {
      // A 404/410 from the queue means fal no longer knows the request — fail
      // the job so it doesn't poll forever. Transient errors leave it open.
      const message = error instanceof Error ? error.message : String(error);
      if (/\b(404|410)\b/.test(message)) {
        await failJob(job.id, "fal no longer reports this request");
        job = (await loadJob(id))!;
      }
    }
  }

  // Retry leg for the automatic voice step: if the chain was lost to a crash
  // or deploy mid-run (stale "pending" claim, or never started), viewing the
  // job re-attempts it. maybeRunVoiceChain's atomic claim makes this safe to
  // hit from every poll.
  if (job.status === "COMPLETED" && parseVoicePlan(job.input)) {
    const chained = (job.input as { chainedJobId?: unknown }).chainedJobId;
    if (typeof chained !== "string" || chained === "pending") {
      await maybeRunVoiceChain(job.id);
      job = (await loadJob(id))!;
    }
  }

  return NextResponse.json({
    job: {
      id: job.id,
      model: job.model,
      type: job.type,
      status: job.status,
      prompt: job.prompt,
      optimizedPrompt: job.optimizedPrompt,
      estimatedCostCents: job.estimatedCostCents,
      errorMessage: job.errorMessage,
      logs: job.logs,
      actualMetrics: job.actualMetrics,
      input: job.input,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      user: job.user,
      queuePosition,
      assets: job.assets.map((a) => ({
        id: a.id,
        kind: a.kind,
        url: a.url,
        contentType: a.contentType,
        width: a.width,
        height: a.height,
        durationSec: a.durationSec,
        fileSize: a.fileSize,
      })),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    include: { assets: { select: { r2Key: true } } },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.userId !== me.id && me.role !== "ADMIN") {
    return NextResponse.json({ error: "You can only delete your own generations" }, { status: 403 });
  }

  // Best-effort: drop persisted media from R2 (no-op when R2 isn't configured
  // or nothing was persisted). Never block the delete on storage cleanup.
  const r2Keys = job.assets.map((a) => a.r2Key).filter((k): k is string => Boolean(k));
  try {
    await deleteFromR2(r2Keys);
  } catch {
    // orphaned objects are acceptable; the DB record is what users see
  }

  // Deleting the Job cascades its Assets. UsageEvent.jobId is set null (not
  // deleted) so the spend a completed generation already incurred stays counted.
  await prisma.job.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
