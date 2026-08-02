import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { isMediaExpired } from "@/lib/media";
import { checkRateLimit } from "@/lib/rate-limit";
import { engineAvailable } from "@/lib/voice/providers";
import {
  MAX_LIPSYNC_SOURCE_SECONDS,
  RevoiceError,
  startRevoice,
  startVoiceSwap,
} from "@/lib/voice/revoice";
import { fal } from "@/lib/fal/client";
import { getFromR2 } from "@/lib/r2";

export const runtime = "nodejs";
// TTS + fal re-hosting run inline before the lipsync job is queued.
export const maxDuration = 300;

const bodySchema = z.object({
  voiceId: z.string().min(1),
  /**
   * "swap": re-voice the video's EXISTING speech (no typing, ElevenLabs
   * speech-to-speech + remux). "script": speak a typed script + lip-sync.
   */
  mode: z.enum(["swap", "script"]).default("script"),
  script: z
    .string()
    .trim()
    .min(4, "Write the line the avatar should say")
    .max(900, "Keep the script under 900 characters (~60s of speech)")
    .optional(),
});

/**
 * "Change voice" on a completed video generation: speak the script with a
 * library voice (MiniMax or ElevenLabs), then queue Kling lip-sync over the
 * existing video. The result is a NEW job that flows through the normal
 * webhook/polling completion path.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const limit = checkRateLimit(`generate:${me.id}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit reached — try again in ${limit.retryAfterSeconds}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  const { id } = await params;
  const source = await prisma.job.findUnique({ where: { id }, include: { assets: true } });
  // Same visibility rule as GET: non-admins only see their own jobs.
  if (!source || (me.role !== "ADMIN" && source.userId !== me.id)) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (source.type !== "VIDEO" || source.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Voice can only be changed on a completed video generation." },
      { status: 400 }
    );
  }

  const videoAsset = source.assets.find(
    (a) => a.kind === "OUTPUT" && (a.contentType.startsWith("video/") || /\.mp4($|\?)/.test(a.url))
  );
  if (!videoAsset) {
    return NextResponse.json({ error: "This generation has no video output." }, { status: 400 });
  }
  if (isMediaExpired(source.completedAt, videoAsset.url)) {
    return NextResponse.json(
      { error: "The source video has expired from fal's CDN — re-run the generation first." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { voiceId, mode, script } = parsed.data;
  if (mode === "script" && !script) {
    return NextResponse.json({ error: "Write the line the avatar should say" }, { status: 400 });
  }

  // Kling lipsync rejects sources over 10s — script mode only (a swap keeps
  // the original timing, so no lip-sync re-render and no duration limit).
  const sourceParams = (source.input as { params?: Record<string, unknown> })?.params ?? {};
  const sourceSeconds = Number(sourceParams.duration);
  if (
    mode === "script" &&
    Number.isFinite(sourceSeconds) &&
    sourceSeconds > MAX_LIPSYNC_SOURCE_SECONDS
  ) {
    return NextResponse.json(
      {
        error: `Kling lip-sync only accepts videos up to ${MAX_LIPSYNC_SOURCE_SECONDS}s — this one is ${sourceSeconds}s. Re-run it at ≤${MAX_LIPSYNC_SOURCE_SECONDS}s first, or use Swap voice instead.`,
      },
      { status: 400 }
    );
  }

  const voice = await prisma.voice.findUnique({ where: { id: voiceId } });
  if (!voice || voice.archivedAt) {
    return NextResponse.json({ error: "Voice not found" }, { status: 404 });
  }
  if (!engineAvailable(voice.provider)) {
    return NextResponse.json(
      { error: `${voice.provider === "ELEVENLABS" ? "ElevenLabs" : "MiniMax"} is not configured.` },
      { status: 503 }
    );
  }

  // R2-persisted outputs have app-relative URLs fal cannot fetch — re-host
  // the bytes on fal storage first. (Inert while R2 is unconfigured.)
  let videoUrl = videoAsset.url;
  if (videoUrl.startsWith("/api/media/") && videoAsset.r2Key) {
    try {
      const obj = await getFromR2(videoAsset.r2Key);
      const bytes = await obj.Body!.transformToByteArray();
      videoUrl = await fal.storage.upload(
        new File([bytes as BlobPart], "source.mp4", { type: "video/mp4" })
      );
    } catch {
      return NextResponse.json(
        { error: "Could not stage the source video for lip-sync — try again." },
        { status: 502 }
      );
    }
  }

  try {
    const { jobId } =
      mode === "swap"
        ? await startVoiceSwap({
            userId: me.id,
            voice,
            videoUrl,
            sourceJobId: source.id,
          })
        : await startRevoice({
            userId: me.id,
            voice,
            script: script!,
            videoUrl,
            sourceJobId: source.id,
            sourceSeconds: Number.isFinite(sourceSeconds) ? sourceSeconds : null,
          });
    return NextResponse.json({ jobId }, { status: 201 });
  } catch (error) {
    if (error instanceof RevoiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Voice change failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
