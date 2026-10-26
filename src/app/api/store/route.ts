import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prestige, redeemItem, RewardsError } from "@/lib/rewards";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("redeem"), itemId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("prestige") }),
]);

/** The signed-in user spends their own points / prestiges. Admin-only while the store is in testing. */
export async function POST(req: Request) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    if (parsed.data.action === "redeem") await redeemItem(me.id, parsed.data.itemId, me.email);
    else await prestige(me.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RewardsError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
