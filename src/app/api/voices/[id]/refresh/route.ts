import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";
import { PREVIEW_TEXT, voiceEngine } from "@/lib/voice/providers";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Regenerates the preview clip. For MiniMax this doubles as the keep-alive:
 * a TTS call resets the 7-day retention clock on the cloned voice.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  if (!trackerCaps(me).canEditAllFields) {
    return NextResponse.json({ error: "Only admins and strategists can refresh voices." }, { status: 403 });
  }

  const { id } = await params;
  const voice = await prisma.voice.findUnique({ where: { id } });
  if (!voice || voice.archivedAt) {
    return NextResponse.json({ error: "Voice not found" }, { status: 404 });
  }

  try {
    const result = await voiceEngine(voice.provider).speak(PREVIEW_TEXT, voice.providerVoiceId);
    // Guarded on archivedAt so a slow refresh can't rewrite a row that was
    // archived while the TTS was running.
    const { count } = await prisma.voice.updateMany({
      where: { id, archivedAt: null },
      data: { previewUrl: result.audioUrl, lastUsedAt: new Date() },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Voice was archived meanwhile" }, { status: 409 });
    }
    const updated = await prisma.voice.findUnique({ where: { id } });
    return NextResponse.json({ voice: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    // A MiniMax clone that already expired surfaces here — tell the user plainly.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
