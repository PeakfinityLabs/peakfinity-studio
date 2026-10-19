import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { findOwnProject } from "@/lib/omni-server";

export const runtime = "nodejs";

/** Removes a clip from the timeline (the source generation is untouched). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; clipId: string }> }
) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id, clipId } = await params;
  if (!(await findOwnProject(me, id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const deleted = await prisma.omniClip.deleteMany({ where: { id: clipId, projectId: id } });
  if (deleted.count === 0) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
