import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard, hashApiToken } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** The caller's own API tokens (never the raw values). */
export async function GET() {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  const tokens = await prisma.apiToken.findMany({
    where: { userId: me.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, last4: true, lastUsedAt: true, createdAt: true },
  });
  return NextResponse.json({ tokens });
}

const createSchema = z.object({ name: z.string().trim().min(1, "Name the token").max(60) });

/** Creates a token. The raw value is returned ONCE — only its sha256 is stored. */
export async function POST(req: Request) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const active = await prisma.apiToken.count({ where: { userId: me.id, revokedAt: null } });
  if (active >= 10) return NextResponse.json({ error: "Revoke an old token first (max 10)" }, { status: 400 });
  const raw = `pst_${randomBytes(24).toString("base64url")}`;
  const token = await prisma.apiToken.create({
    data: { userId: me.id, name: parsed.data.name, tokenHash: hashApiToken(raw), last4: raw.slice(-4) },
    select: { id: true, name: true, last4: true, createdAt: true },
  });
  return NextResponse.json({ token: { ...token, value: raw } }, { status: 201 });
}
