import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { loadStandings, MONTHLY, sheetNames, WEEKLY } from "@/lib/rewards";
import { formatCents } from "@/lib/models/registry";
import { RewardsAdmin, SyncButton } from "@/components/rewards/rewards-admin";

export const metadata = { title: "Rewards — Peakfinity Studio" };
export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  // Admin-only while the rewards program is being tested.
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") redirect("/studio");

  // ponytail: two waves so one page view never needs >6 DB connections at once.
  const [standings, names] = await Promise.all([loadStandings(), sheetNames()]);
  const [awards, items, redemptions, recentApprovals, ledger, sync] = await Promise.all([
    prisma.bonusAward.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { name: true } } } }),
    prisma.rewardItem.findMany({ orderBy: [{ active: "desc" }, { costPoints: "asc" }] }),
    prisma.redemption.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } } } }),
    prisma.sheetCreative.findMany({
      where: { approvedAt: { not: null }, preexisting: false },
      orderBy: { approvedAt: "desc" },
      take: 100,
      select: { key: true, tab: true, title: true, editorName: true, approvedAt: true, voidedAt: true },
    }),
    prisma.pointsEntry.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
    prisma.rewardsSync.findUnique({ where: { id: "main" } }),
  ]);

  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const unpaidCents = awards
    .filter((a) => !a.paidAt && !a.revokedAt)
    .reduce((sum, a) => sum + a.cashCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="label-mono mb-2">Rewards · admin preview</p>
          <h1 className="text-display text-3xl">Bonuses, points & rewards</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Weekly: {WEEKLY.approvals} new approved ads → +{formatCents(WEEKLY.cashCents)} and{" "}
            {WEEKLY.points} points. Monthly: {MONTHLY.approvals} → +{formatCents(MONTHLY.cashCents)}.
            Awarded automatically once per week / month; only ads approved after tracking began count.
            Unpaid cash bonuses: <span className="font-medium text-foreground">{formatCents(unpaidCents)}</span>.
          </p>
        </div>
        <SyncButton sync={sync ? { ...sync, baselineAt: iso(sync.baselineAt), lastSyncAt: iso(sync.lastSyncAt) } : null} />
      </div>

      <RewardsAdmin
        editors={standings.map((s) => ({ id: s.userId, name: s.name, points: s.points }))}
        names={names}
        awards={awards.map((a) => ({
          id: a.id,
          userName: a.user.name,
          kind: a.kind,
          period: a.period,
          approvals: a.approvals,
          cashCents: a.cashCents,
          points: a.points,
          paidAt: iso(a.paidAt),
          revokedAt: iso(a.revokedAt),
          createdAt: a.createdAt.toISOString(),
        }))}
        items={items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))}
        redemptions={redemptions.map((r) => ({
          id: r.id,
          userName: r.user.name,
          itemName: r.itemName,
          costPoints: r.costPoints,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
        approvals={recentApprovals.map((r) => ({ ...r, approvedAt: iso(r.approvedAt)!, voidedAt: iso(r.voidedAt) }))}
        ledger={ledger.map((p) => ({
          id: p.id,
          userName: p.user.name,
          delta: p.delta,
          reason: p.reason,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
