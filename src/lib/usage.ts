import "server-only";
import { prisma } from "@/lib/db";
import { isPrivateLibraryEmail } from "@/lib/job-visibility";
import type { GenModel } from "@/generated/prisma/enums";

export type UsageSummary = {
  totalCents: number;
  eventCount: number;
  byModel: Array<{ model: GenModel; costCents: number; count: number }>;
  byUser: Array<{ userId: string; name: string; costCents: number; count: number }>;
  /** True when a private-library account's row was withheld from byUser. */
  hasWithheldUsers: boolean;
};

/**
 * Team spend. `viewer` scopes the per-editor breakdown: a private-library
 * account's row is withheld from everyone but that account itself, so another
 * admin cannot infer what it has been generating.
 *
 * Totals and the per-model split stay complete on purpose — they attribute
 * nothing to a person, and under-reporting them would break reconciliation
 * against the fal invoice.
 */
export async function getUsageSummary(
  days: number | null,
  viewer?: { id: string; email: string }
): Promise<UsageSummary> {
  const where = days
    ? { createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } }
    : {};

  const [total, byModel, byUser] = await Promise.all([
    prisma.usageEvent.aggregate({ where, _sum: { costCents: true }, _count: true }),
    prisma.usageEvent.groupBy({
      by: ["model"],
      where,
      _sum: { costCents: true },
      _count: true,
      orderBy: { _sum: { costCents: "desc" } },
    }),
    prisma.usageEvent.groupBy({
      by: ["userId"],
      where,
      _sum: { costCents: true },
      _count: true,
      orderBy: { _sum: { costCents: "desc" } },
    }),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: byUser.map((u) => u.userId) } },
    select: { id: true, name: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  // Withhold private-library accounts from the per-editor table (never from
  // their own view). No viewer passed = treat as a non-privileged read.
  let hasWithheldUsers = false;
  const visibleByUser = byUser.filter((row) => {
    const user = userById.get(row.userId);
    if (!user) return true;
    if (viewer && user.id === viewer.id) return true;
    if (!isPrivateLibraryEmail(user.email)) return true;
    hasWithheldUsers = true;
    return false;
  });

  return {
    totalCents: total._sum.costCents ?? 0,
    eventCount: total._count,
    byModel: byModel.map((row) => ({
      model: row.model,
      costCents: row._sum.costCents ?? 0,
      count: row._count,
    })),
    byUser: visibleByUser.map((row) => ({
      userId: row.userId,
      name: userById.get(row.userId)?.name ?? "Unknown",
      costCents: row._sum.costCents ?? 0,
      count: row._count,
    })),
    hasWithheldUsers,
  };
}
