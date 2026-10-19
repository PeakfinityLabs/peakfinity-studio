import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { avatarFieldsSchema } from "@/lib/omni";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Owner only (or an admin): rename, re-describe, or share/unshare. */
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const avatar = await prisma.avatar.findUnique({
    where: { id },
    select: { createdById: true, shared: true },
  });
  // A private avatar that isn't yours doesn't exist as far as you know.
  if (!avatar || (!avatar.shared && avatar.createdById !== me.id)) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }
  if (avatar.createdById !== me.id && me.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the avatar's creator can change it" }, { status: 403 });
  }

  const parsed = avatarFieldsSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  await prisma.avatar.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const avatar = await prisma.avatar.findUnique({
    where: { id },
    select: { createdById: true, shared: true },
  });
  if (!avatar || (!avatar.shared && avatar.createdById !== me.id)) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }
  if (avatar.createdById !== me.id && me.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the avatar's creator can delete it" }, { status: 403 });
  }
  await prisma.avatar.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
