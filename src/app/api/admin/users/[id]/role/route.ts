import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard, isAdminEmail } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const bodySchema = z.object({ role: z.enum(["ADMIN", "EDITOR"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === me.id) {
    return NextResponse.json({ error: "You can't change your own role" }, { status: 400 });
  }
  // ADMIN_EMAILS accounts are always admin (they self-heal on login anyway).
  if (parsed.data.role === "EDITOR" && isAdminEmail(target.email)) {
    return NextResponse.json(
      { error: "This email is in the admin allowlist and can't be demoted" },
      { status: 400 }
    );
  }

  // Promoting to ADMIN also approves (an admin can't be pending).
  const updated = await prisma.user.update({
    where: { id },
    data: {
      role: parsed.data.role,
      ...(parsed.data.role === "ADMIN" ? { status: "APPROVED" } : {}),
    },
    select: { id: true, role: true, status: true },
  });
  return NextResponse.json(updated);
}
