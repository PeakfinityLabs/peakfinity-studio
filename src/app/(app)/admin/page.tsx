import Link from "next/link";
import { getSessionUser, isAdminEmail } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getUsageSummary } from "@/lib/usage";
import { formatCents, formatSeconds } from "@/lib/models/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminUsers } from "@/components/admin/admin-users";
import { AdminSecrets } from "@/components/admin/admin-secrets";
import { AdminStoreItems } from "@/components/admin/admin-store-items";
import { OmniUsageTracker } from "@/components/admin/omni-usage-tracker";
import { dayStart, omniDailyUsage, omniSpendSince, teamToday } from "@/lib/omni-usage";

export const metadata = { title: "Admin — Peakfinity Studio" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ omniFrom?: string; omniTo?: string }>;
}) {
  const me = (await getSessionUser())!;
  const { omniFrom, omniTo } = await searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const omniToDate = omniTo && day.test(omniTo) ? omniTo : teamToday();
  const omniFromDate =
    omniFrom && day.test(omniFrom)
      ? omniFrom
      : new Date(dayStart(omniToDate).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);

  const [users, counts, usage, resetRequests, storeItems, omniDays, topUps] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        jobTitle: true,
        status: true,
        createdAt: true,
        reviewedByEmail: true,
      },
    }),
    prisma.user.groupBy({ by: ["status"], _count: true }),
    // Only the aggregate totals are read here, so the per-editor withholding
    // in getUsageSummary doesn't change these numbers.
    getUsageSummary(null, me),
    // Open self-serve reset requests needing an admin (not emailed directly).
    prisma.passwordResetToken.findMany({
      where: {
        createdVia: "user",
        emailed: false,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { userId: true, createdAt: true },
    }),
    prisma.rewardItem.findMany({
      orderBy: [{ active: "desc" }, { costPoints: "asc" }],
      include: { _count: { select: { redemptions: true } } },
    }),
    omniDailyUsage(omniFromDate, omniToDate),
    prisma.omniTopUp.findMany({ orderBy: { toppedUpAt: "desc" }, take: 12 }),
  ]);
  const lastTopUp = new Map(topUps.map((t) => [t.server, t]));
  const since = await Promise.all(
    (["1", "2"] as const).map(async (server) => {
      const last = lastTopUp.get(server);
      return { server, hasTopUp: Boolean(last), cents: last ? await omniSpendSince(server, last.toppedUpAt) : 0 };
    })
  );
  const omniTotals = omniDays.reduce(
    (a, d) => ({
      clips: a.clips + d.clips,
      seconds: a.seconds + d.seconds,
      cents: a.cents + d.cents,
      s1Cents: a.s1Cents + d.s1Cents,
      s2Cents: a.s2Cents + d.s2Cents,
    }),
    { clips: 0, seconds: 0, cents: 0, s1Cents: 0, s2Cents: 0 }
  );
  const resetRequestByUser = new Map(
    resetRequests.map((r) => [r.userId, r.createdAt.toISOString()])
  );

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const adminCount = users.filter((u) => u.role === "ADMIN").length;

  const stats = [
    { label: "Total users", value: String(users.length) },
    { label: "Pending", value: String(countByStatus["PENDING"] ?? 0) },
    { label: "Approved", value: String(countByStatus["APPROVED"] ?? 0) },
    { label: "Admins", value: String(adminCount) },
    { label: "Total spend", value: formatCents(usage.totalCents) },
    { label: "Generations", value: String(usage.eventCount) },
    { label: "Seconds", value: formatSeconds(usage.totalSeconds) },
  ];

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    jobTitle: u.jobTitle,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    reviewedByEmail: u.reviewedByEmail,
    isSelf: u.id === me.id,
    lockedAdmin: isAdminEmail(u.email),
    resetRequestedAt: resetRequestByUser.get(u.id) ?? null,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="label-mono mb-2">Admin</p>
          <h1 className="text-display text-3xl">Access &amp; administration</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Approve new sign-ups, manage roles, and keep an eye on platform activity.
          </p>
        </div>
        <Link
          href="/tracker"
          className="lift ml-auto rounded-xl border bg-card px-4 py-3 text-sm"
        >
          <span className="label-mono block">Creative tracker</span>
          <span className="mt-1 block font-medium">
            Brief &amp; track creative <span className="text-muted-foreground">→</span>
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="label-mono font-normal">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-display text-2xl tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <OmniUsageTracker
        days={omniDays}
        from={omniFromDate}
        to={omniToDate}
        totals={omniTotals}
        since={since}
        topUps={topUps.map((t) => ({
          id: t.id,
          server: t.server,
          amountCents: t.amountCents,
          day: teamToday(t.toppedUpAt), // team-time date it was entered as
          note: t.note,
        }))}
      />

      <AdminUsers users={rows} />

      <AdminStoreItems
        items={storeItems.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          kind: i.kind,
          costPoints: i.costPoints,
          active: i.active,
          redemptions: i._count.redemptions,
        }))}
      />

      <AdminSecrets />
    </div>
  );
}
