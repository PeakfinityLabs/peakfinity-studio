import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { refreshFalJob } from "@/lib/jobs/complete";
import { refreshOmnirouterJob } from "@/lib/jobs/omnirouter-jobs";
import { parseJobInput } from "@/lib/jobs/types";
import { isOmnirouterEndpoint } from "@/lib/omnirouter";

export const runtime = "nodejs";

const STATUS: Record<string, string> = {
  IN_QUEUE: "queued",
  IN_PROGRESS: "running",
  COMPLETED: "ready",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/**
 * Script API: one Omni generation (your own only).
 * → { id, status: queued|running|ready|failed|cancelled, error, server, cost_usd, seconds, video_url, project_id, prompt }
 * video_url is absolute; send the same Authorization header if it points at /api/media.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  const { id } = await params;
  const load = () =>
    prisma.job.findFirst({
      where: { id, userId: me.id, model: "OMNI_FLASH" },
      include: { assets: { where: { kind: "OUTPUT" } }, usageEvents: { select: { costCents: true, seconds: true } } },
    });
  let job = await load();
  if (!job) return NextResponse.json({ error: "Generation not found" }, { status: 404 });

  // Settle it now if it's still open (same as viewing the project).
  if (job.status === "IN_QUEUE" || job.status === "IN_PROGRESS") {
    const open = isOmnirouterEndpoint(parseJobInput(job.input).endpoint) ? refreshOmnirouterJob(job) : refreshFalJob(job);
    await open.catch(() => undefined);
    job = (await load())!;
  }

  const input = job.input as { params?: Record<string, unknown>; projectId?: string };
  const usage = job.usageEvents[0];
  const video = job.assets.find((a) => a.contentType.startsWith("video/")) ?? job.assets[0];
  return NextResponse.json({
    id: job.id,
    status: STATUS[job.status] ?? job.status.toLowerCase(),
    error: job.errorMessage,
    server: input.params?.server === "2" ? 2 : 1,
    cost_usd: (usage?.costCents ?? job.estimatedCostCents) / 100,
    seconds: usage?.seconds ?? (Number(input.params?.duration) || null),
    video_url: video ? new URL(video.url, req.url).toString() : null,
    project_id: input.projectId ?? null,
    prompt: job.prompt,
    created_at: job.createdAt,
  });
}
