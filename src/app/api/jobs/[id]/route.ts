import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { fal } from "@/lib/fal/client";
import { falErrorMessage, isFalValidationError } from "@/lib/fal/errors";
import { completeJob, failJob } from "@/lib/jobs/complete";
import { parseJobInput } from "@/lib/jobs/types";
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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let job = await loadJob(id);
  if (!job) {
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
