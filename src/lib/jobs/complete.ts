import "server-only";
import { prisma } from "@/lib/db";
import { r2Configured, uploadToR2 } from "@/lib/r2";
import { parseVoicePlan, RevoiceError, startRevoice } from "@/lib/voice/revoice";
import type { Prisma } from "@/generated/prisma/client";

type OutputFile = {
  url: string;
  contentType?: string;
  fileName?: string;
  width?: number;
  height?: number;
  fileSize?: number;
};

type FalFile = {
  url?: string;
  content_type?: string;
  file_name?: string;
  width?: number;
  height?: number;
  file_size?: number;
};

// Model payloads differ, but outputs are always `images: [...]` or `video: {...}`.
export function extractOutputs(payload: unknown): OutputFile[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { images?: FalFile[]; video?: FalFile };
  const files: FalFile[] = [];
  if (Array.isArray(record.images)) files.push(...record.images);
  if (record.video && typeof record.video === "object") files.push(record.video);
  return files
    .filter((f): f is FalFile & { url: string } => typeof f.url === "string")
    .map((f) => ({
      url: f.url,
      contentType: f.content_type,
      fileName: f.file_name,
      width: f.width,
      height: f.height,
      fileSize: f.file_size,
    }));
}

function guessExtension(contentType: string | undefined, url: string): string {
  const fromUrl = new URL(url).pathname.match(/\.(\w{2,5})$/)?.[1];
  if (fromUrl) return fromUrl;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "audio/mpeg": "mp3",
  };
  return (contentType && map[contentType]) || "bin";
}

/**
 * Marks a job COMPLETED: downloads each output from fal's (expiring) URL,
 * re-stores it in R2, records Assets and a UsageEvent.
 *
 * Idempotent: the first caller to flip the status does the work; concurrent
 * webhook + poller calls are safe. Callable from both the webhook handler and
 * the polling fallback (local dev never receives webhooks).
 */
export async function completeJob(jobId: string, payload: unknown): Promise<void> {
  // Claim the completion: only one caller wins this update.
  const claimed = await prisma.job.updateMany({
    where: { id: jobId, status: { in: ["IN_QUEUE", "IN_PROGRESS"] } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const outputs = extractOutputs(payload);
  const persistToR2 = r2Configured();

  const assets: Prisma.AssetCreateManyInput[] = [];
  for (const [index, output] of outputs.entries()) {
    let url = output.url;
    let r2Key: string | null = null;
    let fileSize = output.fileSize;

    if (persistToR2) {
      // Best-effort: the completion claim is already consumed, so a persistence
      // failure must not throw — fall back to the fal URL rather than leaving a
      // COMPLETED job with no assets at all.
      try {
        const res = await fetch(output.url);
        if (!res.ok) throw new Error(`Failed to download fal output (${res.status})`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const contentType =
          output.contentType ?? res.headers.get("content-type") ?? "application/octet-stream";
        const ext = guessExtension(contentType, output.url);
        r2Key = `outputs/${jobId}/${index}.${ext}`;
        await uploadToR2(r2Key, bytes, contentType);
        url = `/api/media/${r2Key}`;
        fileSize = fileSize ?? bytes.byteLength;
      } catch {
        url = output.url;
        r2Key = null;
      }
    }

    assets.push({
      jobId,
      kind: "OUTPUT",
      r2Key,
      url,
      contentType: output.contentType ?? "application/octet-stream",
      width: output.width,
      height: output.height,
      fileSize,
    });
  }

  const metrics =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : { payload };

  await prisma.$transaction([
    prisma.asset.createMany({ data: assets }),
    prisma.job.update({
      where: { id: jobId },
      data: { actualMetrics: metrics as Prisma.InputJsonValue },
    }),
    prisma.usageEvent.create({
      data: {
        userId: job.userId,
        jobId,
        model: job.model,
        costCents: job.estimatedCostCents,
      },
    }),
  ]);

  // A generation submitted with a voice plan chains into TTS + lip-sync
  // automatically once its video exists.
  await maybeRunVoiceChain(jobId, outputs);
}

/** How long a "pending" chain claim is trusted before a retry may re-claim it. */
const CHAIN_CLAIM_TTL_MS = 15 * 60_000;

/**
 * Runs the automatic voice step for a completed video that carries a voice
 * plan. Safe to call repeatedly (webhook, poller, page views): an atomic
 * jsonb claim ("pending") admits exactly one runner, and a claim orphaned by
 * a crash/deploy becomes retryable after 15 minutes. Chain failures never
 * taint the completed video job — they surface as a FAILED lip-sync job.
 */
export async function maybeRunVoiceChain(jobId: string, knownOutputs?: OutputFile[]) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "COMPLETED" || job.type !== "VIDEO") return;
  const voicePlan = parseVoicePlan(job.input);
  if (!voicePlan) return;

  const chained = (job.input as { chainedJobId?: unknown }).chainedJobId;
  if (typeof chained === "string" && chained !== "pending") return;

  // The chain must feed fal a URL it can fetch — the original provider URL,
  // never an app-relative /api/media path.
  const outputs = knownOutputs ?? extractOutputs(job.actualMetrics);
  let videoOutput = outputs.find(
    (o) => o.contentType?.startsWith("video/") || /\.mp4($|\?)/.test(o.url)
  );
  if (!videoOutput) {
    const asset = await prisma.asset.findFirst({
      where: { jobId, kind: "OUTPUT", url: { not: { startsWith: "/api/media/" } } },
    });
    if (asset && (asset.contentType.startsWith("video/") || /\.mp4($|\?)/.test(asset.url))) {
      videoOutput = { url: asset.url, contentType: asset.contentType };
    }
  }
  if (!videoOutput) return;

  // Atomic claim: exactly one caller wins; a stale "pending" (crashed runner)
  // is reclaimable once the job has been completed longer than the TTL.
  const staleBefore = new Date(Date.now() - CHAIN_CLAIM_TTL_MS);
  const claimed = await prisma.$executeRaw`
    UPDATE "Job" SET input = input || '{"chainedJobId":"pending"}'::jsonb
    WHERE id = ${jobId}
      AND (
        input->>'chainedJobId' IS NULL
        OR (input->>'chainedJobId' = 'pending' AND "completedAt" < ${staleBefore})
      )`;
  if (claimed === 0) return;

  const params = (job.input as { params?: Record<string, unknown> })?.params ?? {};
  const seconds = Number(params.duration);
  let chainedJobId: string;
  try {
    const voice = await prisma.voice.findUnique({ where: { id: voicePlan.voiceId } });
    if (!voice || voice.archivedAt) throw new RevoiceError("Voice no longer available", 400);
    const started = await startRevoice({
      userId: job.userId,
      voice,
      script: voicePlan.script,
      videoUrl: videoOutput.url,
      sourceJobId: job.id,
      sourceSeconds: Number.isFinite(seconds) ? seconds : null,
    });
    chainedJobId = started.jobId;
  } catch (error) {
    // Make the failure visible in the library rather than swallowing it.
    const failed = await prisma.job.create({
      data: {
        userId: job.userId,
        model: "KLING_LIPSYNC",
        type: "VIDEO",
        status: "FAILED",
        input: {
          endpoint: "fal-ai/kling-video/lipsync/audio-to-video",
          params: {},
          sourceJobId: job.id,
          voiceId: voicePlan.voiceId,
          voiceName: voicePlan.voiceName,
        } as Prisma.InputJsonValue,
        prompt: voicePlan.script,
        errorMessage: error instanceof Error ? error.message : "Automatic voice step failed",
        completedAt: new Date(),
      },
    });
    chainedJobId = failed.id;
  }
  // jsonb merge via raw SQL: no-throw if the source job was deleted mid-chain
  // (the lip-sync job survives on its own either way).
  await prisma.$executeRaw`
    UPDATE "Job" SET input = input || ${JSON.stringify({ chainedJobId })}::jsonb
    WHERE id = ${jobId}`;
}

/** Marks a job FAILED (idempotent — never downgrades a COMPLETED job). */
export async function failJob(jobId: string, errorMessage: string, payload?: unknown) {
  await prisma.job.updateMany({
    where: { id: jobId, status: { in: ["IN_QUEUE", "IN_PROGRESS"] } },
    data: {
      status: "FAILED",
      errorMessage,
      completedAt: new Date(),
      ...(payload !== undefined
        ? { actualMetrics: payload as Prisma.InputJsonValue }
        : {}),
    },
  });
}
