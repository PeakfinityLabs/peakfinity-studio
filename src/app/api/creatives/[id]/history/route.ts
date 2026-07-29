import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";

export const runtime = "nodejs";

/** Audit trail for one creative: who changed what, when. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const creative = await prisma.creative.findUnique({
    where: { id },
    select: { id: true, editorUserId: true, editor: true, createdById: true },
  });
  if (!creative) return NextResponse.json({ error: "Creative not found" }, { status: 404 });

  const caps = trackerCaps(me);
  const mine =
    creative.editorUserId === me.id ||
    creative.createdById === me.id ||
    creative.editor?.toLowerCase() === me.name.toLowerCase();
  if (!caps.canSeeAll && !mine) {
    return NextResponse.json({ error: "Creative not found" }, { status: 404 });
  }

  const history = await prisma.creativeChange.findMany({
    where: { creativeId: id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return NextResponse.json({ history });
}
