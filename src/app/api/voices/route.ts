import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";
import {
  engineAvailable,
  MINIMAX_RETENTION_DAYS,
  PREVIEW_TEXT,
  voiceEngine,
} from "@/lib/voice/providers";
import { VoiceEngine } from "@/generated/prisma/enums";

export const runtime = "nodejs";
// Cloning + preview can take a while (fal queue + TTS + re-hosting).
export const maxDuration = 300;

const createSchema = z.object({
  name: z.string().trim().min(2, "Give the voice a name").max(80),
  provider: z.nativeEnum(VoiceEngine),
  sampleUrl: z.string().url("Upload a sample first"),
  /** Explicit consent gate — cloning a voice without permission is off-limits. */
  consent: z.literal(true, {
    error: "Confirm you have permission to clone this voice.",
  }),
});

function expiresInDays(voice: { provider: VoiceEngine; lastUsedAt: Date | null; createdAt: Date }) {
  if (voice.provider !== "MINIMAX") return null;
  const anchor = voice.lastUsedAt ?? voice.createdAt;
  const elapsed = (Date.now() - anchor.getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(MINIMAX_RETENTION_DAYS - elapsed));
}

export async function GET(req: Request) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const caps = trackerCaps(me);
  const showArchived =
    new URL(req.url).searchParams.get("archived") === "1" && caps.canEditAllFields;

  const voices = await prisma.voice.findMany({
    where: { archivedAt: showArchived ? { not: null } : null },
    orderBy: { createdAt: "desc" },
  });

  const archivedCount = caps.canEditAllFields
    ? await prisma.voice.count({ where: { archivedAt: { not: null } } })
    : 0;

  return NextResponse.json({
    voices: voices.map((v) => ({ ...v, expiresInDays: expiresInDays(v) })),
    canManage: caps.canEditAllFields,
    archivedCount,
    engines: {
      MINIMAX: engineAvailable("MINIMAX"),
      ELEVENLABS: engineAvailable("ELEVENLABS"),
    },
  });
}

export async function POST(req: Request) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  // Voice cloning is powerful — restrict creation to admins + strategists.
  if (!trackerCaps(me).canEditAllFields) {
    return NextResponse.json(
      { error: "Only admins and strategists can add voices." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, provider, sampleUrl } = parsed.data;

  if (!engineAvailable(provider)) {
    return NextResponse.json(
      { error: `${provider === "ELEVENLABS" ? "ElevenLabs" : "MiniMax"} is not configured.` },
      { status: 503 }
    );
  }

  try {
    const result = await voiceEngine(provider).clone(sampleUrl, {
      name,
      previewText: PREVIEW_TEXT,
    });

    const voice = await prisma.voice.create({
      data: {
        name,
        provider,
        providerVoiceId: result.providerVoiceId,
        sampleUrl,
        previewUrl: result.previewUrl,
        // Both engines ran a preview TTS during clone, which (for MiniMax)
        // starts the 7-day retention clock cleanly.
        lastUsedAt: new Date(),
        createdById: me.id,
        createdByName: me.name,
      },
    });
    return NextResponse.json(
      { voice: { ...voice, expiresInDays: expiresInDays(voice) } },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice cloning failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
