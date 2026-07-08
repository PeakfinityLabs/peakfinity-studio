import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const bodySchema = z.object({ status: z.enum(["APPROVED", "DENIED", "PENDING"]) });

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
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === me.id) {
    return NextResponse.json({ error: "You can't change your own status" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: parsed.data.status,
      reviewedAt: new Date(),
      reviewedByEmail: me.email,
    },
    select: { id: true, status: true },
  });
  return NextResponse.json(updated);
}
