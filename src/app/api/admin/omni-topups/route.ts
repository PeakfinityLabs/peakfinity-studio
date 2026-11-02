import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { dayStart } from "@/lib/omni-usage";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    server: z.enum(["1", "2"]).default("1"),
    amount: z.coerce.number().positive("Enter the top-up amount").max(100_000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the top-up date"),
    note: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal("delete"), id: z.string().min(1) }),
]);

/** Record / remove an Omni balance top-up. Admin only. */
export async function POST(req: Request) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const b = parsed.data;
  if (b.action === "delete") {
    await prisma.omniTopUp.deleteMany({ where: { id: b.id } });
    return NextResponse.json({ ok: true });
  }
  const topUp = await prisma.omniTopUp.create({
    data: {
      server: b.server,
      amountCents: Math.round(b.amount * 100),
      toppedUpAt: dayStart(b.date),
      note: b.note || null,
      createdBy: me.email,
    },
    select: { id: true },
  });
  return NextResponse.json({ topUp }, { status: 201 });
}
