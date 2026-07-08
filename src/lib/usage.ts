import "server-only";
import { prisma } from "@/lib/db";
import type { GenModel } from "@/generated/prisma/enums";

export type UsageSummary = {
  totalCents: number;
  eventCount: number;
  byModel: Array<{ model: GenModel; costCents: number; count: number }>;
  byUser: Array<{ userId: string; name: string; costCents: number; count: number }>;
};

export async function getUsageSummary(days: number | null): Promise<UsageSummary> {
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
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return {
    totalCents: total._sum.costCents ?? 0,
    eventCount: total._count,
    byModel: byModel.map((row) => ({
      model: row.model,
      costCents: row._sum.costCents ?? 0,
      count: row._count,
    })),
    byUser: byUser.map((row) => ({
      userId: row.userId,
      name: nameById.get(row.userId) ?? "Unknown",
      costCents: row._sum.costCents ?? 0,
      count: row._count,
    })),
  };
}
