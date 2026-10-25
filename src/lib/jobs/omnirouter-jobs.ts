import "server-only";
import { prisma } from "@/lib/db";
import { fal } from "@/lib/fal/client";
import { completeJob, failJob } from "@/lib/jobs/complete";
import { parseJobInput } from "@/lib/jobs/types";
import { OMNI_ENDPOINT } from "@/lib/omni";
import {
  costToCents,
  errorText,
  getJob,
  isOmnirouterEndpoint,
  mapStatus,
  modelFromEndpoint,
} from "@/lib/omnirouter";

/**
 * Polls omnirouter for one open job and settles it: completes (re-hosting the
 * output via completeJob, which records Assets + the UsageEvent), fails, or
 * just updates the status. The provider has no webhooks, so every job view /
 * project view calls this. completeJob's atomic claim makes repeats safe.
 */
export async function refreshOmnirouterJob(job: {
  id: string;
  status: string;
  falRequestId: string | null;
  input: unknown;
}): Promise<void> {
  if (job.status !== "IN_QUEUE" && job.status !== "IN_PROGRESS") return;
  if (!job.falRequestId) return;
  const { endpoint } = parseJobInput(job.input);
  if (!isOmnirouterEndpoint(endpoint)) return;

  let remote;
  try {
    remote = await getJob(modelFromEndpoint(endpoint), job.falRequestId);
  } catch (error) {
    // 404 = provider no longer knows the job; anything else is transient.
    if ((error as { status?: number }).status === 404) {
      await failJob(job.id, "The provider no longer reports this job");
    }
    return;
  }

  const mapped = mapStatus(remote.status);
  const cents = costToCents(remote.cost);
  if (mapped === "DONE") {
    if (!remote.output?.url) {
      await failJob(job.id, "Generation finished without a video", remote);
      return;
    }
    // Claim the finalisation so concurrent polls don't each re-host the video:
    // only the caller that flips the job into the transient "settling" marker
    // proceeds. A crashed claim is retried after 5 minutes.
    const claimedAt = (job.input as { settlingAt?: unknown } | null)?.settlingAt;
    if (typeof claimedAt === "number" && Date.now() - claimedAt < 5 * 60_000) return;
    const claim = await prisma.$executeRaw`
      UPDATE "Job" SET input = input || ${JSON.stringify({ settlingAt: Date.now() })}::jsonb
      WHERE id = ${job.id} AND status IN ('IN_QUEUE','IN_PROGRESS')
        AND (input->>'settlingAt' IS NULL OR (input->>'settlingAt')::bigint < ${Date.now() - 5 * 60_000})`;
    if (claim === 0) return;
    // Record the provider's real cost before completeJob copies it to usage.
    if (cents !== null && endpoint !== OMNI_ENDPOINT) {
      await prisma.job.updateMany({
        where: { id: job.id, status: { in: ["IN_QUEUE", "IN_PROGRESS"] } },
        data: { estimatedCostCents: cents },
      });
    }
    // The provider's CDN retention is undocumented, so re-host the video on
    // fal storage (where every other model's output lives) before recording
    // it. completeJob additionally persists to R2 when that's configured.
    // ponytail: on a re-host failure we keep the provider URL rather than fail the job.
    let url = remote.output.url;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(String(res.status));
      url = await fal.storage.upload(new Blob([await res.arrayBuffer()], { type: "video/mp4" }));
    } catch {
      url = remote.output.url;
    }
    await completeJob(job.id, {
      ...remote,
      video: { url, content_type: remote.output.mime_type ?? "video/mp4" },
    });
  } else if (mapped === "FAILED") {
    await failJob(job.id, errorText(remote), remote);
  } else if (mapped !== job.status) {
    await prisma.job.updateMany({
      where: { id: job.id, status: { in: ["IN_QUEUE", "IN_PROGRESS"] } },
      data: { status: mapped },
    });
  }
}
