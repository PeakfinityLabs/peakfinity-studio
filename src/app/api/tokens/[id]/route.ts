import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Revokes one of the caller's own tokens. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  const { id } = await params;
  const { count } = await prisma.apiToken.updateMany({
    where: { id, userId: me.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) return NextResponse.json({ error: "Token not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
