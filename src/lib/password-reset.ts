import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSecret } from "@/lib/secrets";

export const RESET_TOKEN_TTL_MINUTES = 60;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function baseUrl(): string {
  const base = process.env.APP_BASE_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
  return base.replace(/\/$/, "");
}

/**
 * Mints a one-time reset token for a user, superseding any previous unused
 * ones (one active token per user). Returns the raw URL — the only moment
 * the raw token exists; the DB keeps just its hash.
 */
export async function createResetToken(
  userId: string,
  createdVia: string
): Promise<{ url: string; expiresAt: Date }> {
  await prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt, createdVia },
  });
  return { url: `${baseUrl()}/reset/${raw}`, expiresAt };
}

/** Looks up a raw token; returns the row only if unused and unexpired. */
export async function findValidResetToken(raw: string) {
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!token || token.usedAt || token.expiresAt < new Date()) return null;
  return token;
}

/**
 * Sends the reset link by email when a Resend key is configured (via the Admin
 * API-keys panel or env). The from-address defaults to the verified
 * peakfinitylabs.com domain, overridable with RESET_EMAIL_FROM. Returns false
 * when no key is set or sending fails — callers then fall back to the
 * admin-fulfilled flow.
 */
export async function maybeSendResetEmail(to: string, url: string): Promise<boolean> {
  const key = await getSecret("RESEND_API_KEY");
  if (!key) return false;
  const from = process.env.RESET_EMAIL_FROM ?? "Peakfinity Studio <studio@peakfinitylabs.com>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: "Reset your Peakfinity Studio password",
        text: `A password reset was requested for your Peakfinity Studio account.\n\nReset it here (valid for ${RESET_TOKEN_TTL_MINUTES} minutes):\n${url}\n\nIf you didn't request this, you can ignore this email.`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
