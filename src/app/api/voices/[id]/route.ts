import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";

export const runtime = "nodejs";

/**
 * Archive (soft delete) — consistent with the tracker: nothing is hard-deleted
 * here. Note the engine-side clone is NOT removed (MiniMax expires on its own
 * after 7 unused days; ElevenLabs voices stay in the account for possible
 * restore).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  if (!trackerCaps(me).canEditAllFields) {
    return NextResponse.json({ error: "Only admins and strategists can archive voices." }, { status: 403 });
  }

  const { id } = await params;
  const voice = await prisma.voice.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
  if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });
  if (voice.archivedAt) return NextResponse.json({ archived: true });

  await prisma.voice.update({
    where: { id },
    data: { archivedAt: new Date(), archivedBy: me.name },
  });
  return NextResponse.json({ archived: true });
}
