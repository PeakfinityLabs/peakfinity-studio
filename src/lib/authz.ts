import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { Role, UserStatus } from "@/generated/prisma/enums";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  /**
   * Display title (Editor, Strategist, …). Cosmetic everywhere EXCEPT the
   * creative tracker, where "Strategist" grants full board visibility — see
   * trackerCaps() in lib/creatives.ts. It never affects Studio, Library,
   * Usage or Admin access; those key off `role` alone.
   */
  jobTitle: string | null;
  status: UserStatus;
};

/** Comma-separated allowlist of emails that are always ADMIN + APPROVED. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}

/**
 * The current user, read fresh from the DB on every call. Gating (approval,
 * admin) must not trust the cached JWT: an admin can change a user's status or
 * role mid-session, and the change must take effect on the next request.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      jobTitle: true,
      status: true,
    },
  });
}

/**
 * Self-healing admin bootstrap: any user whose email is in ADMIN_EMAILS is
 * forced to ADMIN + APPROVED. Idempotent; safe to call on every login and at
 * registration so admins (incl. pre-existing accounts) never get stuck pending.
 */
export async function ensureAdminForEmail(userId: string, email: string): Promise<void> {
  if (!isAdminEmail(email)) return;
  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ role: { not: "ADMIN" } }, { status: { not: "APPROVED" } }],
    },
    data: { role: "ADMIN", status: "APPROVED" },
  });
}

/**
 * For API route handlers: returns the approved user, or a NextResponse to
 * return immediately (401 unauthenticated, 403 not approved). Pass
 * `requireAdmin` to also gate on the ADMIN role.
 *
 *   const gate = await apiGuard();
 *   if (gate instanceof NextResponse) return gate;
 *   // gate is the approved SessionUser
 */
export async function apiGuard(
  opts: { requireAdmin?: boolean } = {}
): Promise<SessionUser | NextResponse> {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.status !== "APPROVED") {
    return NextResponse.json({ error: "Your account is not approved yet" }, { status: 403 });
  }
  if (opts.requireAdmin && me.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  return me;
}
