import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { activateKeySlot, addKeySlot, deleteKeySlot, isSecretName } from "@/lib/secrets";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    secret: z.string(),
    title: z.string().trim().min(1, "Give the key a title").max(60),
    value: z.string().trim().min(8, "That key looks too short.").max(500),
    activate: z.boolean().default(true),
  }),
  // slotId null = use the default key again.
  z.object({ action: z.literal("activate"), secret: z.string(), slotId: z.string().nullable() }),
  z.object({ action: z.literal("delete"), slotId: z.string().min(1) }),
]);

/** Extra titled keys per secret: add, pick which one is live, delete. Admin only. */
export async function POST(req: Request) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const b = parsed.data;
  if (b.action === "delete") {
    await deleteKeySlot(b.slotId).catch(() => null);
    return NextResponse.json({ ok: true });
  }
  if (!isSecretName(b.secret)) return NextResponse.json({ error: "Unknown secret" }, { status: 400 });
  if (b.action === "add") {
    const id = await addKeySlot(b.secret, b.title, b.value, me.email);
    if (b.activate) await activateKeySlot(b.secret, id);
  } else {
    await activateKeySlot(b.secret, b.slotId);
  }
  return NextResponse.json({ ok: true });
}
