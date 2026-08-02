import "server-only";
import { prisma } from "@/lib/db";
import { fal, falWebhookUrl } from "@/lib/fal/client";
import { lipsyncCostCents } from "@/lib/models/registry";
import { elevenLabsSpeechToSpeech, voiceEngine } from "@/lib/voice/providers";
import type { Voice } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export const LIPSYNC_ENDPOINT = "fal-ai/kling-video/lipsync/audio-to-video";
/** Kling lipsync hard limit on the source video. */
export const MAX_LIPSYNC_SOURCE_SECONDS = 10;

export class RevoiceError extends Error {
  constructor(
    message: string,
    /** HTTP status the API layer should use (400 user error / 502 provider). */
    public readonly status: 400 | 502
  ) {
    super(message);
  }
}

/**
 * The re-voice step shared by the "Change voice" button and the automatic
 * chain after a voiced Kling generation: speak the script with a library
 * voice, queue Kling lip-sync over the video, and record it as a new Job
 * that completes through the normal webhook/polling path.
 */
export async function startRevoice(opts: {
  userId: string;
  voice: Voice;
  script: string;
  videoUrl: string;
  sourceJobId: string;
  /** Source video length when known — drives the cost estimate. */
  sourceSeconds: number | null;
}): Promise<{ jobId: string }> {
  const { userId, voice, script, videoUrl, sourceJobId, sourceSeconds } = opts;

  // Step 1 — TTS (fast, inline). Also resets MiniMax's 7-day retention clock.
  let audioUrl: string;
  let audioMs: number | null;
  try {
    const speech = await voiceEngine(voice.provider).speak(script, voice.providerVoiceId);
    audioUrl = speech.audioUrl;
    audioMs = speech.durationMs;
  } catch (error) {
    throw new RevoiceError(
      error instanceof Error ? error.message : "Voice generation failed",
      502
    );
  }
  await prisma.voice.update({ where: { id: voice.id }, data: { lastUsedAt: new Date() } });

  if (audioMs !== null && (audioMs < 2000 || audioMs > 60_000)) {
    throw new RevoiceError(
      audioMs < 2000
        ? "The spoken script is under 2 seconds — write a longer line."
        : "The spoken script is over 60 seconds — shorten it.",
      400
    );
  }

  // Step 2 — queue the lip-sync; the normal completion path takes it from here.
  let falRequestId: string;
  try {
    const submitted = await fal.queue.submit(LIPSYNC_ENDPOINT, {
      input: { video_url: videoUrl, audio_url: audioUrl },
      webhookUrl: falWebhookUrl(),
    });
    falRequestId = submitted.request_id;
  } catch (error) {
    throw new RevoiceError(
      `fal rejected the submission: ${error instanceof Error ? error.message : "unknown error"}`,
      502
    );
  }

  const job = await prisma.job.create({
    data: {
      userId,
      model: "KLING_LIPSYNC",
      type: "VIDEO",
      status: "IN_QUEUE",
      falRequestId,
      input: {
        endpoint: LIPSYNC_ENDPOINT,
        params: { video_url: videoUrl, audio_url: audioUrl },
        sourceJobId,
        voiceId: voice.id,
        voiceName: voice.name,
        voiceProvider: voice.provider,
      } as Prisma.InputJsonValue,
      prompt: script,
      estimatedCostCents: lipsyncCostCents(sourceSeconds ?? MAX_LIPSYNC_SOURCE_SECONDS),
      assets: {
        create: [
          { kind: "INPUT" as const, url: videoUrl, contentType: "video/mp4" },
          { kind: "INPUT" as const, url: audioUrl, contentType: "audio/mpeg" },
        ],
      },
    },
  });

  return { jobId: job.id };
}

const MERGE_ENDPOINT = "fal-ai/ffmpeg-api/merge-audio-video";

/**
 * "Swap voice" (Jonah's flow, matching ElevenLabs' voice changer): the
 * video's EXISTING speech is converted to the chosen voice via
 * speech-to-speech — same words, same timing, no typing — then remuxed onto
 * the video. ElevenLabs voices only; fast (seconds, not minutes); no 10s
 * source limit because there is no lip-sync re-render (timing is unchanged,
 * so the lips already match).
 */
export async function startVoiceSwap(opts: {
  userId: string;
  voice: Voice;
  videoUrl: string;
  sourceJobId: string;
}): Promise<{ jobId: string }> {
  const { userId, voice, videoUrl, sourceJobId } = opts;
  if (voice.provider !== "ELEVENLABS") {
    throw new RevoiceError("Voice swap requires an ElevenLabs voice.", 400);
  }

  // Step 1 — speech-to-speech (inline; typically a few seconds).
  let audioUrl: string;
  try {
    const swapped = await elevenLabsSpeechToSpeech(videoUrl, voice.providerVoiceId);
    audioUrl = swapped.audioUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice swap failed";
    // ElevenLabs reports a soundless video as a corrupted file — translate.
    if (/corrupt/i.test(message)) {
      throw new RevoiceError(
        "This video has no audible speech to swap. Use New script instead (or generate with Kling audio on).",
        400
      );
    }
    throw new RevoiceError(message, 502);
  }
  await prisma.voice.update({ where: { id: voice.id }, data: { lastUsedAt: new Date() } });

  // Step 2 — remux the new audio onto the video via the queue, so the normal
  // completion path (webhook/polling) finishes the job.
  let falRequestId: string;
  try {
    const submitted = await fal.queue.submit(MERGE_ENDPOINT, {
      input: { video_url: videoUrl, audio_url: audioUrl },
      webhookUrl: falWebhookUrl(),
    });
    falRequestId = submitted.request_id;
  } catch (error) {
    throw new RevoiceError(
      `fal rejected the submission: ${error instanceof Error ? error.message : "unknown error"}`,
      502
    );
  }

  const job = await prisma.job.create({
    data: {
      userId,
      model: "VOICE_SWAP",
      type: "VIDEO",
      status: "IN_QUEUE",
      falRequestId,
      input: {
        endpoint: MERGE_ENDPOINT,
        params: { video_url: videoUrl, audio_url: audioUrl },
        sourceJobId,
        voiceId: voice.id,
        voiceName: voice.name,
        voiceProvider: voice.provider,
        mode: "swap",
      } as Prisma.InputJsonValue,
      prompt: `Voice swap → ${voice.name}`,
      // STS billing is character-equivalent pennies + a tiny ffmpeg run.
      estimatedCostCents: 2,
      assets: {
        create: [
          { kind: "INPUT" as const, url: videoUrl, contentType: "video/mp4" },
          { kind: "INPUT" as const, url: audioUrl, contentType: "audio/mpeg" },
        ],
      },
    },
  });

  return { jobId: job.id };
}

/** Shape of the voice plan stored on a generation that should auto-chain. */
export type VoicePlan = {
  voiceId: string;
  voiceName: string;
  provider: string;
  script: string;
};

export function parseVoicePlan(input: unknown): VoicePlan | null {
  if (!input || typeof input !== "object") return null;
  const plan = (input as { voice?: unknown }).voice;
  if (!plan || typeof plan !== "object") return null;
  const p = plan as Record<string, unknown>;
  if (typeof p.voiceId !== "string" || typeof p.script !== "string") return null;
  return {
    voiceId: p.voiceId,
    voiceName: typeof p.voiceName === "string" ? p.voiceName : "",
    provider: typeof p.provider === "string" ? p.provider : "",
    script: p.script,
  };
}
