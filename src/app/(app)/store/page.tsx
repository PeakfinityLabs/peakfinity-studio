import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { levelUpPoints, MAX_LEVEL, POINTS_PER_APPROVAL, userProgress } from "@/lib/rewards";
import { StoreView } from "@/components/rewards/store-view";

export const metadata = { title: "Point Store — Peakfinity Studio" };
export const dynamic = "force-dynamic";

export default async function StorePage() {
  // Admin-only while the store is being tested.
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") redirect("/studio");

  const [progress, items, mine] = await Promise.all([
    userProgress(me.id),
    prisma.rewardItem.findMany({ where: { active: true }, orderBy: { costPoints: "asc" } }),
    prisma.redemption.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-mono mb-2">Point Store · admin preview</p>
        <h1 className="text-display text-3xl">Spend your points</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Earn {POINTS_PER_APPROVAL} points for every approved creative, plus {levelUpPoints(2)}–
          {levelUpPoints(MAX_LEVEL)} points each time you level up. Redemptions are reviewed by an admin.
        </p>
      </div>
      <StoreView
        progress={progress}
        items={items.map((i) => ({ id: i.id, name: i.name, description: i.description, kind: i.kind, costPoints: i.costPoints }))}
        mine={mine.map((r) => ({
          id: r.id,
          itemName: r.itemName,
          costPoints: r.costPoints,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
