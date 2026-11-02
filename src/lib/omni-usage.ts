import "server-only";
import { prisma } from "@/lib/db";

/**
 * Daily Google Omni (OMNI_FLASH) usage for the admin tracker. Days are team
 * time (UTC+8), same as rewards. Server comes from the job's params
 * (missing = Server 1, i.e. jobs from before the switch existed).
 */
// ISO offset for JS dates. SQL uses the named zone: Postgres reads "+08:00" as POSIX (8h WEST).
const TEAM_OFFSET = "+08:00";

export type OmniDay = {
  day: string; // YYYY-MM-DD (team time)
  clips: number;
  seconds: number;
  cents: number;
  s1Cents: number;
  s2Cents: number;
};

/** "YYYY-MM-DD" in team time → the UTC instant that day starts. */
export const dayStart = (day: string) => new Date(`${day}T00:00:00${TEAM_OFFSET}`);

/** Today's date in team time. */
export function teamToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export async function omniDailyUsage(from: string, to: string): Promise<OmniDay[]> {
  const start = dayStart(from);
  const end = new Date(dayStart(to).getTime() + 86_400_000);
  const rows = await prisma.$queryRaw<
    Array<{ day: string; clips: bigint; seconds: number | null; cents: bigint; s1: bigint; s2: bigint }>
  >`
    SELECT to_char((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day,
           count(*) AS clips,
           sum(u.seconds) AS seconds,
           sum(u."costCents") AS cents,
           sum(CASE WHEN coalesce(j.input->'params'->>'server', '1') = '2' THEN 0 ELSE u."costCents" END) AS s1,
           sum(CASE WHEN coalesce(j.input->'params'->>'server', '1') = '2' THEN u."costCents" ELSE 0 END) AS s2
    FROM "UsageEvent" u
    LEFT JOIN "Job" j ON j.id = u."jobId"
    WHERE u.model = 'OMNI_FLASH' AND u."createdAt" >= ${start} AND u."createdAt" < ${end}
    GROUP BY 1
    ORDER BY 1 DESC`;
  return rows.map((r) => ({
    day: r.day,
    clips: Number(r.clips),
    seconds: Number(r.seconds ?? 0),
    cents: Number(r.cents),
    s1Cents: Number(r.s1),
    s2Cents: Number(r.s2),
  }));
}

/** Omni spend on one server since a moment (for "since last top-up"). */
export async function omniSpendSince(server: "1" | "2", since: Date): Promise<number> {
  const [r] = await prisma.$queryRaw<Array<{ cents: bigint | null }>>`
    SELECT sum(u."costCents") AS cents
    FROM "UsageEvent" u LEFT JOIN "Job" j ON j.id = u."jobId"
    WHERE u.model = 'OMNI_FLASH' AND u."createdAt" >= ${since}
      AND coalesce(j.input->'params'->>'server', '1') = ${server}`;
  return Number(r?.cents ?? 0);
}
