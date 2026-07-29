import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";

export const runtime = "nodejs";

/** Brings an archived creative back — the undo for an accidental removal. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  if (!trackerCaps(me).canArchive) {
    return NextResponse.json({ error: "Only admins can restore a creative." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.creative.findUnique({
    where: { id },
    select: { id: true, archivedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
  if (!existing.archivedAt) return NextResponse.json({ restored: true });

  await prisma.creative.update({
    where: { id },
    data: { archivedAt: null, archivedBy: null },
  });
  await prisma.creativeChange.create({
    data: { creativeId: id, userId: me.id, userName: me.name, action: "RESTORE" },
  });

  return NextResponse.json({ restored: true });
}
