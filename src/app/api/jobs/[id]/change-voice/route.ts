import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fal, falWebhookUrl } from "@/lib/fal/client";
import { isMediaExpired } from "@/lib/media";
import { lipsyncCostCents } from "@/lib/models/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { engineAvailable, voiceEngine } from "@/lib/voice/providers";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
// TTS + fal re-hosting run inline before the lipsync job is queued.
export const maxDuration = 300;

const LIPSYNC_ENDPOINT = "fal-ai/kling-video/lipsync/audio-to-video";
// Kling lipsync hard limits: source video 2–10s, audio 2–60s ≤5MB.
const MAX_SOURCE_SECONDS = 10;

const bodySchema = z.object({
  voiceId: z.string().min(1),
  script: z
    .string()
    .trim()
    .min(4, "Write the line the avatar should say")
    .max(900, "Keep the script under 900 characters (~60s of speech)"),
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

  // Kling lipsync rejects sources over 10s. The requested duration is stored
  // in the source job's input; when it's unknown ("auto"), let fal validate.
  const sourceParams = (source.input as { params?: Record<string, unknown> })?.params ?? {};
  const sourceSeconds = Number(sourceParams.duration);
  if (Number.isFinite(sourceSeconds) && sourceSeconds > MAX_SOURCE_SECONDS) {
    return NextResponse.json(
      {
        error: `Kling lip-sync only accepts videos up to ${MAX_SOURCE_SECONDS}s — this one is ${sourceSeconds}s. Re-run it at ≤${MAX_SOURCE_SECONDS}s first.`,
      },
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
  const { voiceId, script } = parsed.data;

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

  // Step 1 — TTS (fast, inline). Also resets MiniMax's 7-day retention clock.
  let audioUrl: string;
  let audioMs: number | null;
  try {
    const speech = await voiceEngine(voice.provider).speak(script, voice.providerVoiceId);
    audioUrl = speech.audioUrl;
    audioMs = speech.durationMs;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  await prisma.voice.update({ where: { id: voice.id }, data: { lastUsedAt: new Date() } });

  if (audioMs !== null && (audioMs < 2000 || audioMs > 60_000)) {
    return NextResponse.json(
      {
        error:
          audioMs < 2000
            ? "The spoken script is under 2 seconds — write a longer line."
            : "The spoken script is over 60 seconds — shorten it.",
      },
      { status: 400 }
    );
  }

  // Step 2 — queue the lip-sync; the normal completion path takes it from here.
  let falRequestId: string;
  try {
    const submitted = await fal.queue.submit(LIPSYNC_ENDPOINT, {
      input: { video_url: videoAsset.url, audio_url: audioUrl },
      webhookUrl: falWebhookUrl(),
    });
    falRequestId = submitted.request_id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "fal submission failed";
    return NextResponse.json({ error: `fal rejected the submission: ${message}` }, { status: 502 });
  }

  const job = await prisma.job.create({
    data: {
      userId: me.id,
      model: "KLING_LIPSYNC",
      type: "VIDEO",
      status: "IN_QUEUE",
      falRequestId,
      input: {
        endpoint: LIPSYNC_ENDPOINT,
        params: { video_url: videoAsset.url, audio_url: audioUrl },
        sourceJobId: source.id,
        voiceId: voice.id,
        voiceName: voice.name,
        voiceProvider: voice.provider,
      } as Prisma.InputJsonValue,
      prompt: script,
      estimatedCostCents: lipsyncCostCents(
        Number.isFinite(sourceSeconds) ? sourceSeconds : MAX_SOURCE_SECONDS
      ),
      assets: {
        create: [
          { kind: "INPUT" as const, url: videoAsset.url, contentType: "video/mp4" },
          { kind: "INPUT" as const, url: audioUrl, contentType: "audio/mpeg" },
        ],
      },
    },
  });

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
