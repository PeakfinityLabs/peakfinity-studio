// Rewards rules self-check (pure logic, no DB):
//   DATABASE_URL=postgres://x:x@127.0.0.1:1/x npx tsx --conditions=react-server scripts/check-rewards.ts
import assert from "node:assert/strict";
import { earnedBonuses, levelFor, parseTab, periodKeys, periodStarts, planRow, splitEditors } from "../src/lib/rewards";

const row = (status: string) => ({ key: "k", tab: "Oct", title: "T", editorName: "Nicu", status });
const now = new Date("2026-10-26T04:00:00Z");
const before = new Date("2026-10-20T00:00:00Z");

// Old approvals never count: Ready at the first sync → preexisting, forever.
assert.deepEqual(planRow(row("Ready"), undefined, true, now), { preexisting: true, approvedAt: null });
assert.deepEqual(planRow(row("Ready"), { status: "Ready", preexisting: true, approvedAt: null }, false, now), { preexisting: true, approvedAt: null });
assert.deepEqual(planRow(row("Ready "), { status: "Editing", preexisting: true, approvedAt: null }, false, now), { preexisting: true, approvedAt: null });
// Not ready at baseline, Ready later → counts from the sync that saw it.
assert.deepEqual(planRow(row("Editing"), undefined, true, now), { preexisting: false, approvedAt: null });
assert.deepEqual(planRow(row("ready"), { status: "Editing", preexisting: false, approvedAt: null }, false, now), { preexisting: false, approvedAt: now });
// A brand-new row that arrives Ready after tracking began counts.
assert.deepEqual(planRow(row("Ready"), undefined, false, now), { preexisting: false, approvedAt: now });
// Approval time is kept across syncs; leaving Ready un-counts it.
assert.deepEqual(planRow(row("Ready"), { status: "Ready", preexisting: false, approvedAt: before }, false, now), { preexisting: false, approvedAt: before });
assert.deepEqual(planRow(row("Needs Revision"), { status: "Ready", preexisting: false, approvedAt: before }, false, now), { preexisting: false, approvedAt: null });

// Periods in team time (UTC+8): Sun 23:30 UTC = Mon 07:30 local → next ISO week.
assert.deepEqual(periodKeys(new Date("2026-10-25T15:59:00Z")), { week: "2026-W43", month: "2026-10" });
assert.deepEqual(periodKeys(new Date("2026-10-25T16:00:00Z")), { week: "2026-W44", month: "2026-10" });
assert.deepEqual(periodKeys(new Date("2026-10-31T16:30:00Z")), { week: "2026-W44", month: "2026-11" });
assert.equal(periodStarts(now).weekStart.toISOString(), "2026-10-25T16:00:00.000Z");
assert.equal(periodStarts(now).monthStart.toISOString(), "2026-09-30T16:00:00.000Z");

// Weekly: 8 in one week → bonus; 7 → none. Monthly: 45 in one month.
const at = (iso: string, n: number, userId = "u") => Array.from({ length: n }, () => ({ userId, approvedAt: new Date(iso) }));
const kinds = (c: ReturnType<typeof at>) => earnedBonuses(c).map((b) => `${b.userId}:${b.kind}:${b.period}`).sort();
assert.deepEqual(kinds(at("2026-10-27T02:00:00Z", 8)), ["u:WEEKLY:2026-W44"]);
assert.deepEqual(kinds(at("2026-10-27T02:00:00Z", 7)), []);
assert.deepEqual(kinds([...at("2026-10-24T02:00:00Z", 4), ...at("2026-10-27T02:00:00Z", 4)]), []); // split across weeks
const month = [0, 1, 2, 3, 4].flatMap((w) => at(`2026-10-${String(5 + w * 5).padStart(2, "0")}T02:00:00Z`, 9));
assert.equal(month.length, 45);
assert.ok(kinds(month).includes("u:MONTHLY:2026-10"));
assert.ok(!kinds(month.slice(1)).includes("u:MONTHLY:2026-10"));

// Shared credit and names.
assert.deepEqual(splitEditors("Ali, Cassandra"), ["ali", "cassandra"]);
assert.deepEqual(splitEditors(" JONAH "), ["jonah"]);
assert.deepEqual(splitEditors(""), []);

// Sheet parsing: header detection, duplicate titles get distinct keys.
const csv = "LP,Page,Strategist,Title,Breif Link,Editor,Video Link,Content Needed?,Status\nx,,,Statin side effects,,Ali,,,Ready\nx,,,Statin side effects,,Ali,,,Ready\n,,,,,,,,\n";
assert.deepEqual(parseTab("1", "July", csv).map((r) => r.key), ["1:statin side effects#1", "1:statin side effects#2"]);

assert.equal(levelFor(0).name, "Rookie");
assert.equal(levelFor(10).name, "Bronze");
assert.equal(levelFor(9999).name, "Diamond");
console.log("✔ rewards checks passed");
