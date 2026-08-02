import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";
import { PREVIEW_TEXT, voiceEngine } from "@/lib/voice/providers";

export const runtime = "nodejs";
// Restoring a MiniMax voice runs a keep-alive TTS.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  if (!trackerCaps(me).canEditAllFields) {
    return NextResponse.json({ error: "Only admins and strategists can restore voices." }, { status: 403 });
  }

  const { id } = await params;
  const voice = await prisma.voice.findUnique({
    where: { id },
    select: { id: true, archivedAt: true, provider: true, providerVoiceId: true },
  });
  if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });
  if (!voice.archivedAt) return NextResponse.json({ restored: true });

  await prisma.voice.update({ where: { id }, data: { archivedAt: null, archivedBy: null } });

  // MiniMax deletes clones unused for 7 days — a voice that sat archived past
  // that may be gone provider-side. Prove it still speaks (which also resets
  // the retention clock); if it can't, restore anyway but say so.
  if (voice.provider === "MINIMAX") {
    try {
      const preview = await voiceEngine("MINIMAX").speak(PREVIEW_TEXT, voice.providerVoiceId);
      await prisma.voice.update({
        where: { id },
        data: { previewUrl: preview.audioUrl, lastUsedAt: new Date() },
      });
    } catch {
      return NextResponse.json({
        restored: true,
        warning:
          "Restored, but the MiniMax clone no longer responds — it likely expired (unused for 7+ days). Re-clone it from the original sample.",
      });
    }
  }
  return NextResponse.json({ restored: true });
}
