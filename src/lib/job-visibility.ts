import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/authz";

/**
 * Private-library accounts: their generations are visible ONLY to themselves —
 * not to other editors, and deliberately NOT to other admins either. This is
 * the one place in the app where the ADMIN role does not grant visibility.
 *
 * Configured with PRIVATE_LIBRARY_EMAILS (comma-separated). The default is
 * baked in so the guarantee holds even if the env var is never set in Render;
 * setting it to an empty string is an explicit opt-out (nobody private).
 */
const DEFAULT_PRIVATE_LIBRARY_EMAILS = "team@peakfinitylabs.com";

export function privateLibraryEmails(): string[] {
  const raw = process.env.PRIVATE_LIBRARY_EMAILS ?? DEFAULT_PRIVATE_LIBRARY_EMAILS;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPrivateLibraryEmail(email: string): boolean {
  return privateLibraryEmails().includes(email.trim().toLowerCase());
}

/** True when the signed-in user's own generations are hidden from everyone else. */
export function hasPrivateLibrary(me: Pick<SessionUser, "email">): boolean {
  return isPrivateLibraryEmail(me.email);
}

type JobOwner = {
  /** Job.userId */
  userId: string;
  /** Email of the job's owner (User.email). */
  ownerEmail: string;
};

/**
 * Whether `me` may view/act on a single job. Order matters: your own work is
 * always yours; a private account's work is nobody else's, admin or not;
 * everything else follows the normal admin-sees-all rule.
 */
export function canViewJob(
  me: Pick<SessionUser, "id" | "email" | "role">,
  job: JobOwner
): boolean {
  if (job.userId === me.id) return true;
  if (isPrivateLibraryEmail(job.ownerEmail)) return false;
  return me.role === "ADMIN";
}

/**
 * Prisma filter restricting a Job query to what `me` may see. Mirrors
 * canViewJob() for list queries — keep the two in step.
 *
 * Non-admins are scoped to their own jobs. Admins see everything except jobs
 * owned by a private-library account other than themselves.
 */
export function visibleJobsWhere(me: Pick<SessionUser, "id" | "email" | "role">): Prisma.JobWhereInput {
  if (me.role !== "ADMIN") return { userId: me.id };

  const myEmail = me.email.trim().toLowerCase();
  const hiddenEmails = privateLibraryEmails().filter((email) => email !== myEmail);
  if (hiddenEmails.length === 0) return {};

  // Case-insensitive on purpose. Registration lowercases emails, so a plain
  // `notIn` would almost always work — but "almost" is the wrong guarantee
  // here: one row stored as Team@… (seeded by hand, imported, or edited
  // directly in the DB) would silently fail to filter and leak the whole
  // library. `mode: "insensitive"` cannot fail that way.
  //
  // This MUST stay equivalent to canViewJob(), which is also
  // case-insensitive. The OR keeps your own jobs visible even when your own
  // account is the private one.
  // `mode` must be a SIBLING of `not`, never nested inside it: Prisma 7
  // accepts `{ not: { equals, mode } }` at the TypeScript level but rejects it
  // at runtime ("Unknown argument `mode`"), so tsc alone will not catch that
  // mistake — only executing the query does.
  return {
    OR: [
      { userId: me.id },
      {
        AND: hiddenEmails.map((email) => ({
          user: { email: { not: email, mode: "insensitive" as const } },
        })),
      },
    ],
  };
}
