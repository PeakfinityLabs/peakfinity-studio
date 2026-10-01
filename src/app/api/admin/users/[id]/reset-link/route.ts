import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { createResetToken, RESET_TOKEN_TTL_MINUTES } from "@/lib/password-reset";

export const runtime = "nodejs";

/**
 * Mints a one-time password-reset link for a user. The link is shown once to
 * the admin (who passes it on via Slack/Discord/etc.) and supersedes any
 * outstanding tokens — including the "reset requested" marker, which is why
 * fulfilling a request clears it from the panel.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { url, expiresAt } = await createResetToken(target.id, me.email);
  return NextResponse.json({
    url,
    email: target.email,
    expiresAt: expiresAt.toISOString(),
    ttlMinutes: RESET_TOKEN_TTL_MINUTES,
  });
}
