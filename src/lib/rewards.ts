import { prisma } from "@/lib/db";
import { mapHeaders, parseCsv } from "@/lib/creative-csv";

/**
 * Editor rewards, driven by APPROVED ads in the creative-tracking Google Sheet
 * ("Ready" status = approved). The sheet is read through its public CSV
 * export, so it must stay shared as "Anyone with the link can view".
 *
 * Only NEW approvals count: the first sync records a baseline and every row
 * already Ready then is marked `preexisting` and never counts. After that, a
 * row counts from the moment a sync first sees it Ready.
 */
export const SHEET_ID =
  process.env.REWARDS_SHEET_ID ?? "18vGc95jiYX7qa2d2Siv-bnOLnEYsED9XSuISd4deKnw";

export const WEEKLY = { approvals: 8, cashCents: 5000, points: 20 } as const;
export const MONTHLY = { approvals: 45, cashCents: 15000, points: 0 } as const;

/** Weeks (Mon–Sun) and months are counted in UTC+8 (PH / team time). */
const TZ_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;

// ─── Levels & points ─────────────────────────────────────────────────────────
// XP = counted (new) approved creatives. Level 1 → 2 takes 5; each level after
// takes a little more (+1 every 3 levels), so level 10 needs 54 approvals and
// level 50 needs 621. At 50 an editor can prestige: level resets to 1, XP past
// the cap carries over, and they level (and earn level-up points) again.

export const MAX_LEVEL = 50;
export const POINTS_PER_APPROVAL = 2;

/** Approvals needed to go from `level` to `level + 1`. */
export const levelCost = (level: number) => 5 + Math.floor((level - 1) / 3);

/** THRESHOLDS[L] = total XP needed to reach level L (index 0 unused). */
export const THRESHOLDS: readonly number[] = (() => {
  const t = [0, 0];
  for (let l = 1; l < MAX_LEVEL; l++) t.push(t[l] + levelCost(l));
  return t;
})();

/** Points for reaching `level`: 2–10 → 5, 11–20 → 7, 21–30 → 9, 31–50 → 12. */
export function levelUpPoints(level: number): number {
  if (level <= 1) return 0;
  if (level <= 10) return 5;
  if (level <= 20) return 7;
  if (level <= 30) return 9;
  return 12;
}

/** Level-up points earned getting from level 1 to `level`. */
const runPoints = (level: number) => {
  let sum = 0;
  for (let l = 2; l <= level; l++) sum += levelUpPoints(l);
  return sum;
};
/** One full run, level 1 → 50 (445 points). */
export const FULL_RUN_POINTS = runPoints(MAX_LEVEL);

/** Tier name shown next to the level. */
export function tierFor(level: number): string {
  if (level >= MAX_LEVEL) return "Legend";
  if (level > 30) return "Platinum";
  if (level > 20) return "Gold";
  if (level > 10) return "Silver";
  return "Bronze";
}

export type Progress = ReturnType<typeof progressFrom>;

/**
 * Level, progress and points from an editor's counted approvals, prestige
 * state and points ledger. Approval and level-up points are derived (never
 * stored), so voiding an approval removes its points too.
 */
export function progressFrom(
  approvals: number,
  ledgerPoints: number,
  profile: { prestige: number; xpOffset: number } | null
) {
  const prestige = profile?.prestige ?? 0;
  const xp = Math.max(0, approvals - (profile?.xpOffset ?? 0));
  let level = 1;
  while (level < MAX_LEVEL && xp >= THRESHOLDS[level + 1]) level++;
  const maxed = level >= MAX_LEVEL;
  const into = xp - THRESHOLDS[level];
  const needed = maxed ? 0 : levelCost(level);
  const earned = approvals * POINTS_PER_APPROVAL + prestige * FULL_RUN_POINTS + runPoints(level);
  return {
    level,
    tier: tierFor(level),
    prestige,
    xp,
    into,
    needed,
    pct: maxed ? 100 : Math.round((into / needed) * 100),
    canPrestige: maxed,
    nextReward: maxed ? 0 : levelUpPoints(level + 1),
    approvals,
    /** Points from approvals + level-ups (derived, not in the ledger). */
    earned,
    points: ledgerPoints + earned,
  };
}

/** { week: "2026-W44", month: "2026-10" } for a moment, in team time. */
export function periodKeys(d: Date) {
  const t = new Date(d.getTime() + TZ_MS);
  const month = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  // ISO week: the week's Thursday decides the year; weeks start Monday.
  const dow = (t.getUTCDay() + 6) % 7;
  const thu = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - dow + 3));
  const week = 1 + Math.floor((thu.getTime() - Date.UTC(thu.getUTCFullYear(), 0, 1)) / DAY_MS / 7);
  return { week: `${thu.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, month };
}

/** Start of the current week (Monday 00:00) and month, in team time, as real instants. */
export function periodStarts(now = new Date()) {
  const t = new Date(now.getTime() + TZ_MS);
  const dayStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - TZ_MS;
  return {
    weekStart: new Date(dayStart - ((t.getUTCDay() + 6) % 7) * DAY_MS),
    monthStart: new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - TZ_MS),
  };
}

// ─── Sheet → rows ────────────────────────────────────────────────────────────

export const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const isReady = (status: string) => normName(status) === "ready";

/** "Ali, Cassandra" / "Ali & Cassandra" → ["ali", "cassandra"]; each gets full credit. */
export function splitEditors(cell: string | null): string[] {
  if (!cell) return [];
  return cell
    .split(/,|&|\/|\band\b/i)
    .map(normName)
    .filter(Boolean);
}

export type SheetRow = { key: string; tab: string; title: string; editorName: string | null; status: string };

/** One tab's CSV → rows keyed "<gid>:<title>#<n>" (the sheet has no row ids). */
export function parseTab(gid: string, tabName: string, csv: string): SheetRow[] {
  const table = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
  let headerIdx = table.findIndex((r, i) => i < 5 && mapHeaders(r).title !== undefined);
  if (headerIdx < 0) headerIdx = 0;
  const map = mapHeaders(table[headerIdx] ?? []);
  if (map.title === undefined) return [];
  const cell = (r: string[], f: string) => (map[f] === undefined ? "" : (r[map[f]] ?? "").trim());
  const seen = new Map<string, number>();
  const rows: SheetRow[] = [];
  for (const r of table.slice(headerIdx + 1)) {
    const title = cell(r, "title");
    if (!title) continue;
    const base = `${gid}:${normName(title)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    rows.push({ key: `${base}#${n}`, tab: tabName, title, editorName: cell(r, "editor") || null, status: cell(r, "status") });
  }
  return rows;
}

type Known = { status: string; preexisting: boolean; approvedAt: Date | null };

/**
 * What each sheet row should look like after this sync. Pure, so the
 * "old approvals never count" rule is testable (scripts/check-rewards.ts).
 */
export function planRow(row: SheetRow, known: Known | undefined, baseline: boolean, now: Date) {
  const ready = isReady(row.status);
  if (!known) {
    return { preexisting: baseline && ready, approvedAt: !baseline && ready ? now : null };
  }
  // Ready before tracking began: never counts, even if it's re-approved later.
  if (known.preexisting) return { preexisting: true, approvedAt: null };
  if (!ready) return { preexisting: false, approvedAt: null };
  return { preexisting: false, approvedAt: known.approvedAt ?? now };
}

async function fetchSheet(): Promise<SheetRow[]> {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;
  const html = await (await fetch(`${base}/htmlview`, { signal: AbortSignal.timeout(30_000) })).text();
  const tabs = [...html.matchAll(/items\.push\(\{name: "([^"]+)", pageUrl: "[^"]*?gid=(\d+)/g)].map(
    (m) => ({ name: m[1], gid: m[2] })
  );
  if (tabs.length === 0) {
    throw new Error("Couldn't read the sheet's tabs — is it shared as “Anyone with the link can view”?");
  }
  const rows: SheetRow[] = [];
  for (const tab of tabs) {
    const res = await fetch(`${base}/export?format=csv&gid=${tab.gid}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/csv")) {
      throw new Error(`Couldn't download the “${tab.name}” tab (${res.status})`);
    }
    rows.push(...parseTab(tab.gid, tab.name, await res.text()));
  }
  return rows;
}

// ─── Sync + awards ───────────────────────────────────────────────────────────

let running: Promise<SyncResult> | null = null;
export type SyncResult = { rows: number; newApprovals: number; awards: number; baseline: boolean };

/** Reads the sheet, records new approvals, grants any bonuses earned. Concurrent calls share one run. */
export function syncRewards(): Promise<SyncResult> {
  // ponytail: in-process lock — fine on one Render instance; use a DB lock if it ever scales out.
  running ??= doSync().finally(() => (running = null));
  return running;
}

async function doSync(): Promise<SyncResult> {
  const now = new Date();
  try {
    const rows = await fetchSheet(); // throws before any write if the sheet is unreadable
    const state = await prisma.rewardsSync.upsert({ where: { id: "main" }, create: {}, update: {} });
    const baseline = !state.baselineAt;
    const known = new Map(
      (await prisma.sheetCreative.findMany({ select: { key: true, status: true, preexisting: true, approvedAt: true } })).map(
        (k) => [k.key, k]
      )
    );
    let newApprovals = 0;
    const writes = rows.flatMap((row) => {
      const prev = known.get(row.key);
      const plan = planRow(row, prev, baseline, now);
      if (plan.approvedAt === now) newApprovals++;
      const unchanged =
        prev &&
        prev.status === row.status &&
        prev.preexisting === plan.preexisting &&
        prev.approvedAt?.getTime() === plan.approvedAt?.getTime();
      if (unchanged) return [];
      const data = { tab: row.tab, title: row.title, editorName: row.editorName, status: row.status, ...plan };
      return [prisma.sheetCreative.upsert({ where: { key: row.key }, create: { key: row.key, ...data }, update: data })];
    });
    // Short batches (not one long transaction) so a sync never holds a DB
    // connection for long. Row writes are idempotent, and baselineAt is only
    // set once every row is stored — a failed first sync simply re-runs as the
    // baseline next time.
    for (let i = 0; i < writes.length; i += 50) await prisma.$transaction(writes.slice(i, i + 50));
    await prisma.rewardsSync.update({
      where: { id: "main" },
      data: { lastSyncAt: now, lastError: null, rows: rows.length, ...(baseline ? { baselineAt: now } : {}) },
    });
    const awards = await grantBonuses();
    return { rows: rows.length, newApprovals, awards, baseline };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.rewardsSync
      .upsert({ where: { id: "main" }, create: { lastError: message }, update: { lastError: message } })
      .catch(() => {});
    throw error;
  }
}

/** Sheet name → user id: admin mapping first, then a unique name / first-name match. */
export async function nameResolver() {
  const [users, aliases] = await Promise.all([
    prisma.user.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } }),
    prisma.editorAlias.findMany(),
  ]);
  const alias = new Map(aliases.map((a) => [a.sheetName, a.userId]));
  const resolve = (name: string): string | null => {
    if (alias.has(name)) return alias.get(name) ?? null;
    const exact = users.filter((u) => normName(u.name) === name);
    if (exact.length === 1) return exact[0].id;
    const token = users.filter((u) => normName(u.name).split(" ").includes(name));
    return token.length === 1 ? token[0].id : null;
  };
  return { users, alias, resolve };
}

/** Every counted approval, credited to each mapped editor on the row. */
export async function creditedApprovals() {
  const [rows, { resolve }] = await Promise.all([
    prisma.sheetCreative.findMany({
      where: { approvedAt: { not: null }, voidedAt: null, preexisting: false },
      select: { editorName: true, approvedAt: true },
    }),
    nameResolver(),
  ]);
  return rows.flatMap((r) =>
    [...new Set(splitEditors(r.editorName).map(resolve))]
      .filter((id): id is string => id !== null)
      .map((userId) => ({ userId, approvedAt: r.approvedAt! }))
  );
}

/** Which bonuses the approvals earn: [{ userId, kind, period, approvals }]. Pure. */
export function earnedBonuses(credits: Array<{ userId: string; approvedAt: Date }>) {
  const counts = new Map<string, number>();
  for (const c of credits) {
    const { week, month } = periodKeys(c.approvedAt);
    for (const k of [`${c.userId}|WEEKLY|${week}`, `${c.userId}|MONTHLY|${month}`]) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts].flatMap(([k, approvals]) => {
    const [userId, kind, period] = k.split("|") as [string, "WEEKLY" | "MONTHLY", string];
    const rule = kind === "WEEKLY" ? WEEKLY : MONTHLY;
    return approvals >= rule.approvals ? [{ userId, kind, period, approvals }] : [];
  });
}

async function grantBonuses(): Promise<number> {
  const earned = earnedBonuses(await creditedApprovals());
  const existing = new Set(
    (await prisma.bonusAward.findMany({ select: { userId: true, kind: true, period: true } })).map(
      (a) => `${a.userId}|${a.kind}|${a.period}`
    )
  );
  let granted = 0;
  for (const e of earned) {
    if (existing.has(`${e.userId}|${e.kind}|${e.period}`)) continue;
    const rule = e.kind === "WEEKLY" ? WEEKLY : MONTHLY;
    const label = e.kind === "WEEKLY" ? `Weekly bonus ${e.period}` : `Monthly bonus ${e.period}`;
    try {
      // The unique (userId, kind, period) makes this award-once, points included.
      await prisma.$transaction([
        prisma.bonusAward.create({
          data: { userId: e.userId, kind: e.kind, period: e.period, approvals: e.approvals, cashCents: rule.cashCents, points: rule.points },
        }),
        ...(rule.points ? [prisma.pointsEntry.create({ data: { userId: e.userId, delta: rule.points, reason: label } })] : []),
      ]);
      granted++;
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error; // P2002 = a concurrent run won
    }
  }
  return granted;
}

/** Ledger part of each balance (bonuses, manual adjustments, redemptions). */
export async function ledgerBalances(): Promise<Map<string, number>> {
  const rows = await prisma.pointsEntry.groupBy({ by: ["userId"], _sum: { delta: true } });
  return new Map(rows.map((r) => [r.userId, r._sum.delta ?? 0]));
}

/** One user's level / points — the header progress bar and the Point Store. */
export async function userProgress(userId: string): Promise<Progress> {
  const [credits, ledger, profile] = await Promise.all([
    creditedApprovals(),
    prisma.pointsEntry.aggregate({ where: { userId }, _sum: { delta: true } }),
    prisma.rewardsProfile.findUnique({ where: { userId } }),
  ]);
  const approvals = credits.filter((c) => c.userId === userId).length;
  return progressFrom(approvals, ledger._sum.delta ?? 0, profile);
}

export class RewardsError extends Error {}

/**
 * Spends points on a store item. Serialised per user (advisory lock) so two
 * redemptions can't both pass the balance check.
 */
export async function redeemItem(userId: string, itemId: string, by: string) {
  // Earned points come from approvals; only the ledger can change under us, so it's re-read inside the lock.
  const { earned } = await userProgress(userId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const item = await tx.rewardItem.findUnique({ where: { id: itemId } });
    if (!item || !item.active) throw new RewardsError("That reward isn't available");
    const ledger = (await tx.pointsEntry.aggregate({ where: { userId }, _sum: { delta: true } }))._sum.delta ?? 0;
    const available = earned + ledger;
    if (available < item.costPoints) throw new RewardsError(`Not enough points (${available} of ${item.costPoints})`);
    await tx.redemption.create({ data: { userId, itemId: item.id, itemName: item.name, costPoints: item.costPoints } });
    await tx.pointsEntry.create({ data: { userId, delta: -item.costPoints, reason: `Redeemed: ${item.name}`, createdBy: by } });
  });
}

// ─── Read models for the admin pages ─────────────────────────────────────────

export type Standing = {
  userId: string;
  name: string;
  week: number;
  month: number;
  lifetime: number;
  points: number;
  progress: Progress;
};

/** Per-editor counts for this week / month / all time, plus points and level. */
export async function loadStandings(now = new Date()): Promise<Standing[]> {
  const [credits, ledger, users, profiles] = await Promise.all([
    creditedApprovals(),
    ledgerBalances(),
    prisma.user.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } }),
    prisma.rewardsProfile.findMany(),
  ]);
  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const { weekStart, monthStart } = periodStarts(now);
  const stats = new Map(users.map((u) => [u.id, { week: 0, month: 0, lifetime: 0 }]));
  for (const c of credits) {
    const s = stats.get(c.userId);
    if (!s) continue; // account no longer approved
    s.lifetime++;
    if (c.approvedAt >= monthStart) s.month++;
    if (c.approvedAt >= weekStart) s.week++;
  }
  return users
    .map((u) => {
      const s = stats.get(u.id)!;
      const progress = progressFrom(s.lifetime, ledger.get(u.id) ?? 0, profileOf.get(u.id) ?? null);
      return { userId: u.id, name: u.name, ...s, points: progress.points, progress };
    })
    .sort((a, b) => b.month - a.month || b.week - a.week || b.lifetime - a.lifetime || a.name.localeCompare(b.name));
}

/** Every editor name in the sheet and who it resolves to (for the mapping table). */
export async function sheetNames() {
  const [rows, { users, alias, resolve }] = await Promise.all([
    prisma.sheetCreative.findMany({ select: { editorName: true, approvedAt: true, preexisting: true, voidedAt: true } }),
    nameResolver(),
  ]);
  const byName = new Map<string, { rows: number; counted: number }>();
  for (const r of rows) {
    for (const n of splitEditors(r.editorName)) {
      const e = byName.get(n) ?? { rows: 0, counted: 0 };
      e.rows++;
      if (r.approvedAt && !r.voidedAt && !r.preexisting) e.counted++;
      byName.set(n, e);
    }
  }
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return [...byName]
    .map(([sheetName, e]) => {
      const userId = resolve(sheetName);
      return {
        sheetName,
        ...e,
        userId,
        userName: userId ? (nameOf.get(userId) ?? null) : null,
        manual: alias.has(sheetName),
      };
    })
    .sort((a, b) => Number(a.userId !== null) - Number(b.userId !== null) || b.rows - a.rows);
}

/** Level 50 → prestige: back to level 1 with the next prestige rank. XP past the cap carries over. */
export async function prestige(userId: string) {
  const p = await userProgress(userId);
  if (!p.canPrestige) throw new RewardsError(`Reach level ${MAX_LEVEL} to prestige`);
  await prisma.rewardsProfile.upsert({
    where: { userId },
    create: { userId, prestige: 1, xpOffset: THRESHOLDS[MAX_LEVEL] },
    update: { prestige: { increment: 1 }, xpOffset: { increment: THRESHOLDS[MAX_LEVEL] } },
  });
}
