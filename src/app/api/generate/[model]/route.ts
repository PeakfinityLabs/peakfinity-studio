import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fal, falWebhookUrl } from "@/lib/fal/client";
import { isModelSlug, lipsyncCostCents, MODELS } from "@/lib/models/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { engineAvailable } from "@/lib/voice/providers";
import { MAX_LIPSYNC_SOURCE_SECONDS } from "@/lib/voice/revoice";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

// Optional one-step voicing (Kling only): generate the video, then auto-chain
// TTS + lip-sync with a library voice once it completes.
const voicePlanSchema = z.object({
  voiceId: z.string().min(1),
  voiceScript: z
    .string()
    .trim()
    .min(4, "Write the line the avatar should say")
    .max(900, "Keep the script under 900 characters (~60s of speech)"),
});

const GENERATE_LIMIT = 10; // per user per minute — protects the fal budget

export const runtime = "nodejs";

function collectInputUrls(params: Record<string, unknown>): string[] {
  const urls: string[] = [];
  for (const key of ["image_urls", "video_urls", "audio_urls"]) {
    const value = params[key];
    if (Array.isArray(value)) urls.push(...value.filter((v): v is string => typeof v === "string"));
  }
  for (const key of ["image_url", "end_image_url", "mask_url"]) {
    const value = params[key];
    if (typeof value === "string") urls.push(value);
  }
  return urls;
}

export async function POST(req: Request, { params }: { params: Promise<{ model: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const limit = checkRateLimit(`generate:${me.id}`, GENERATE_LIMIT, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit reached — try again in ${limit.retryAfterSeconds}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  const { model: slug } = await params;
  if (!isModelSlug(slug)) {
    return NextResponse.json({ error: `Unknown model: ${slug}` }, { status: 404 });
  }
  const def = MODELS[slug];

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = def.schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const modelParams = parsed.data;

  // Voice plan (one-step voiced generation) — Kling only.
  let voicePlan: { voiceId: string; voiceName: string; provider: string; script: string } | null =
    null;
  const rawBody = body as Record<string, unknown>;
  if (rawBody.voiceId) {
    if (def.genModel !== "KLING_O3") {
      return NextResponse.json(
        { error: "Voiced generation is only available on Kling." },
        { status: 400 }
      );
    }
    const parsedVoice = voicePlanSchema.safeParse(rawBody);
    if (!parsedVoice.success) {
      return NextResponse.json(
        { error: parsedVoice.error.issues[0]?.message ?? "Invalid voice input" },
        { status: 400 }
      );
    }
    const seconds = Number(modelParams.duration);
    if (Number.isFinite(seconds) && seconds > MAX_LIPSYNC_SOURCE_SECONDS) {
      return NextResponse.json(
        {
          error: `Voiced videos are capped at ${MAX_LIPSYNC_SOURCE_SECONDS}s (Kling lip-sync limit) — pick a shorter duration.`,
        },
        { status: 400 }
      );
    }
    const voice = await prisma.voice.findUnique({ where: { id: parsedVoice.data.voiceId } });
    if (!voice || voice.archivedAt) {
      return NextResponse.json({ error: "Voice not found" }, { status: 404 });
    }
    if (!engineAvailable(voice.provider)) {
      return NextResponse.json(
        { error: `${voice.provider === "ELEVENLABS" ? "ElevenLabs" : "MiniMax"} is not configured.` },
        { status: 503 }
      );
    }
    voicePlan = {
      voiceId: voice.id,
      voiceName: voice.name,
      provider: voice.provider,
      script: parsedVoice.data.voiceScript,
    };
    // The TTS audio replaces the soundtrack — Kling's own audio (+33% cost)
    // would be discarded by the lip-sync step anyway.
    modelParams.generate_audio = false;
  }

  const endpoint = def.resolveEndpoint(modelParams);
  const falInput = def.toFalInput(modelParams);
  const estimatedCostCents =
    def.estimateCostCents(modelParams) +
    (voicePlan
      ? lipsyncCostCents(
          Number.isFinite(Number(modelParams.duration))
            ? Number(modelParams.duration)
            : MAX_LIPSYNC_SOURCE_SECONDS
        )
      : 0);

  let falRequestId: string;
  try {
    const submitted = await fal.queue.submit(endpoint, {
      input: falInput,
      webhookUrl: falWebhookUrl(),
    });
    falRequestId = submitted.request_id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "fal submission failed";
    return NextResponse.json(
      { error: `fal rejected the submission: ${message}` },
      { status: 502 }
    );
  }

  const prompt = typeof modelParams.prompt === "string" ? modelParams.prompt : "";
  const optimizedPrompt =
    typeof (body as Record<string, unknown>)?.["_originalPrompt"] === "string" ? prompt : null;
  const originalPrompt =
    typeof (body as Record<string, unknown>)?.["_originalPrompt"] === "string"
      ? ((body as Record<string, unknown>)["_originalPrompt"] as string)
      : prompt;

  const job = await prisma.job.create({
    data: {
      userId: me.id,
      model: def.genModel,
      type: def.type,
      status: "IN_QUEUE",
      falRequestId,
      input: {
        endpoint,
        params: falInput,
        ...(voicePlan ? { voice: voicePlan } : {}),
      } as Prisma.InputJsonValue,
      prompt: originalPrompt,
      optimizedPrompt,
      estimatedCostCents,
      assets: {
        create: collectInputUrls(modelParams).map((url) => ({
          kind: "INPUT" as const,
          url,
          contentType: "application/octet-stream",
        })),
      },
    },
  });

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
