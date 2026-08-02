import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";
import {
  engineAvailable,
  listElevenLabsAccountVoices,
  PREVIEW_TEXT,
  voiceEngine,
} from "@/lib/voice/providers";

export const runtime = "nodejs";
// Import generates a preview TTS + re-hosts it on fal storage.
export const maxDuration = 300;

/**
 * The team's ElevenLabs account already holds voices cloned elsewhere (e.g.
 * through Higgsfield). These endpoints let admins/strategists pull them into
 * the library directly — no re-cloning, so the account's clone quota is
 * untouched.
 */

const importSchema = z.object({
  providerVoiceId: z.string().trim().min(1),
  /** Optional rename; defaults to the name in the ElevenLabs account. */
  name: z.string().trim().min(2).max(80).optional(),
});

function guardResponse(caps: { canEditAllFields: boolean }) {
  if (!caps.canEditAllFields) {
    return NextResponse.json(
      { error: "Only admins and strategists can import voices." },
      { status: 403 }
    );
  }
  if (!engineAvailable("ELEVENLABS")) {
    return NextResponse.json({ error: "ElevenLabs is not configured." }, { status: 503 });
  }
  return null;
}

/** List the account's voices, flagging ones already in the library. */
export async function GET() {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  const guard = guardResponse(trackerCaps(me));
  if (guard) return guard;

  try {
    const [account, existing] = await Promise.all([
      listElevenLabsAccountVoices(),
      prisma.voice.findMany({
        where: { provider: "ELEVENLABS" },
        select: { providerVoiceId: true, archivedAt: true },
      }),
    ]);
    const imported = new Map(existing.map((v) => [v.providerVoiceId, v.archivedAt === null]));

    // Custom voices first (those are the ones the team actually cloned),
    // then the stock catalog, alphabetical within each group.
    const rank: Record<string, number> = { cloned: 0, generated: 0, professional: 1, premade: 2 };
    const voices = account
      .map((v) => ({
        ...v,
        imported: imported.has(v.providerVoiceId),
        importedActive: imported.get(v.providerVoiceId) ?? false,
      }))
      .sort(
        (a, b) =>
          (rank[a.category] ?? 3) - (rank[b.category] ?? 3) || a.name.localeCompare(b.name)
      );
    return NextResponse.json({ voices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not list ElevenLabs voices";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Import one account voice: verify it exists, generate a preview, save. */
export async function POST(req: Request) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  const guard = guardResponse(trackerCaps(me));
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { providerVoiceId } = parsed.data;

  const existing = await prisma.voice.findFirst({
    where: { provider: "ELEVENLABS", providerVoiceId },
    select: { archivedAt: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error:
          existing.archivedAt === null
            ? "That voice is already in the library."
            : "That voice is already in the library's archive — restore it instead.",
      },
      { status: 409 }
    );
  }

  try {
    // Resolve against the account so we can't save a bogus id, and to pick up
    // the account's own name for the voice.
    const account = await listElevenLabsAccountVoices();
    const source = account.find((v) => v.providerVoiceId === providerVoiceId);
    if (!source) {
      return NextResponse.json(
        { error: "That voice was not found in the ElevenLabs account." },
        { status: 404 }
      );
    }
    const name = parsed.data.name ?? source.name;

    // Generating the preview also proves the voice is usable with our key
    // (ElevenLabs blocks TTS on voices it has flagged for verification).
    const preview = await voiceEngine("ELEVENLABS").speak(PREVIEW_TEXT, providerVoiceId);

    const voice = await prisma.voice.create({
      data: {
        name,
        provider: "ELEVENLABS",
        providerVoiceId,
        sampleUrl: null, // imported, not cloned here — no local sample
        previewUrl: preview.audioUrl,
        lastUsedAt: new Date(),
        createdById: me.id,
        createdByName: me.name,
      },
    });
    return NextResponse.json({ voice: { ...voice, expiresInDays: null } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice import failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
