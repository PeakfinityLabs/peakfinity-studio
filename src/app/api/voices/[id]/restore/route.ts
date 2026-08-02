import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  if (!trackerCaps(me).canEditAllFields) {
    return NextResponse.json({ error: "Only admins and strategists can restore voices." }, { status: 403 });
  }

  const { id } = await params;
  const voice = await prisma.voice.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
  if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });
  if (!voice.archivedAt) return NextResponse.json({ restored: true });

  await prisma.voice.update({ where: { id }, data: { archivedAt: null, archivedBy: null } });
  return NextResponse.json({ restored: true });
}
