import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/models/registry";
import { LEVELS, loadStandings, MONTHLY, periodKeys, WEEKLY } from "@/lib/rewards";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SyncButton } from "@/components/rewards/rewards-admin";

export const metadata = { title: "Leaderboard — Peakfinity Studio" };
export const dynamic = "force-dynamic";

/** Progress bar toward a target (pure CSS, no client JS). */
function Bar({ value, target }: { value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={target}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {value}/{target}
      </span>
    </div>
  );
}

export default async function LeaderboardPage() {
  // Admin-only while the rewards program is being tested.
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") redirect("/studio");

  const [standings, sync] = await Promise.all([
    loadStandings(),
    prisma.rewardsSync.findUnique({ where: { id: "main" } }),
  ]);
  const { week, month } = periodKeys(new Date());
  const active = standings.filter((s) => s.lifetime > 0 || s.points !== 0);
  const rest = standings.length - active.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="label-mono mb-2">Leaderboard · admin preview</p>
          <h1 className="text-display text-3xl">Approved ads</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            New approvals from the creative sheet (status <span className="font-mono">Ready</span>
            ). Week {week} · month {month}. Weeks run Monday–Sunday, team time (UTC+8).
          </p>
        </div>
        <SyncButton sync={sync ? { ...sync, baselineAt: sync.baselineAt?.toISOString() ?? null, lastSyncAt: sync.lastSyncAt?.toISOString() ?? null } : null} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="label-mono font-normal">Weekly target</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-display text-2xl">
              {WEEKLY.approvals} approved → +{formatCents(WEEKLY.cashCents)} & {WEEKLY.points} pts
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="label-mono font-normal">Monthly target</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-display text-2xl">
              {MONTHLY.approvals} approved → +{formatCents(MONTHLY.cashCents)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-display text-lg">Rankings — this month</CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {sync?.baselineAt
                ? "No new approvals yet. Ads marked Ready in the sheet from now on will show up here."
                : "Not synced yet — press “Sync sheet” to start tracking. Ads already Ready at the first sync don’t count."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Editor</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>This week</TableHead>
                  <TableHead>This month</TableHead>
                  <TableHead className="text-right">All time</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((s, i) => (
                  <TableRow key={s.userId}>
                    <TableCell className="font-mono tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant={s.level.index > 1 ? "default" : "secondary"}>
                        Lv {s.level.index} · {s.level.name}
                      </Badge>
                      {s.level.next && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {s.level.next.min - s.lifetime} to {s.level.next.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Bar value={s.week} target={WEEKLY.approvals} />
                    </TableCell>
                    <TableCell>
                      <Bar value={s.month} target={MONTHLY.approvals} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.lifetime}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rest > 0 && active.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {rest} other approved account{rest === 1 ? "" : "s"} with no new approvals yet.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Levels (lifetime new approvals):{" "}
        {LEVELS.map((l, i) => `Lv ${i + 1} ${l.name} ${l.min}+`).join(" · ")}. Placeholder
        thresholds — they&apos;ll be tuned with the points program.
      </p>
    </div>
  );
}
