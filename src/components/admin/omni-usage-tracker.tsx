"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/lib/http";

type Day = { day: string; clips: number; seconds: number; cents: number; s1Cents: number; s2Cents: number };
type TopUp = { id: string; server: string; amountCents: number; day: string; note: string | null };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Admin → Omni usage: per-day Omni spend with a date range, plus balance top-ups. */
export function OmniUsageTracker({
  days,
  from,
  to,
  totals,
  topUps,
  since,
}: {
  days: Day[];
  from: string;
  to: string;
  totals: { clips: number; seconds: number; cents: number; s1Cents: number; s2Cents: number };
  topUps: TopUp[];
  since: Array<{ server: string; cents: number; hasTopUp: boolean }>;
}) {
  const router = useRouter();
  const [range, setRange] = useState({ from, to });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ server: "1", amount: "", date: to, note: "" });

  const apply = (next: { from: string; to: string }) => {
    setRange(next);
    router.push(`/admin?omniFrom=${next.from}&omniTo=${next.to}#omni-usage`);
  };

  const addTopUp = async () => {
    setBusy(true);
    try {
      await fetchJson("/api/admin/omni-topups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", ...form, amount: Number(form.amount) }),
      });
      toast.success("Top-up recorded");
      setForm((f) => ({ ...f, amount: "", note: "" }));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the top-up");
    } finally {
      setBusy(false);
    }
  };

  const removeTopUp = async (id: string) => {
    if (!window.confirm("Delete this top-up?")) return;
    try {
      await fetchJson("/api/admin/omni-topups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  };

  const max = Math.max(1, ...days.map((d) => d.cents));
  const sinceText = (server: string) => {
    const s = since.find((x) => x.server === server);
    return s?.hasTopUp ? `${money(s.cents)} spent` : "no top-up recorded";
  };
  const niceDay = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <Card id="omni-usage" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-display text-lg">Google Omni usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="omni-from">From</Label>
            <Input
              id="omni-from"
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => apply({ ...range, from: e.target.value || range.from })}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="omni-to">To</Label>
            <Input
              id="omni-to"
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => apply({ ...range, to: e.target.value || range.to })}
              className="h-9 w-40"
            />
          </div>
          <div className="flex gap-1 rounded-lg border p-1">
            {[
              { label: "7d", days: 7 },
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  const end = new Date(`${to}T00:00:00Z`);
                  const start = new Date(end.getTime() - (p.days - 1) * 86_400_000);
                  apply({ from: start.toISOString().slice(0, 10), to });
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Clips", value: String(totals.clips) },
            { label: "Seconds", value: `${Math.round(totals.seconds).toLocaleString("en-US")}s` },
            { label: "Server 1 spend", value: money(totals.s1Cents) },
            { label: "Server 2 spend", value: money(totals.s2Cents) },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border p-3">
              <p className="label-mono text-[11px]">{s.label}</p>
              <p className="mt-1 text-display text-xl tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          {money(totals.cents)} of Omni total between {niceDay(from)} and {niceDay(to)} · since last top-up:
          Server 1 {sinceText("1")} · Server 2 {sinceText("2")}
        </p>

        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Omni usage in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-normal">Date</th>
                  <th className="py-2 text-right font-normal">Clips</th>
                  <th className="py-2 text-right font-normal">Seconds</th>
                  <th className="py-2 text-right font-normal">Server 1</th>
                  <th className="py-2 text-right font-normal">Server 2</th>
                  <th className="py-2 text-right font-normal">Total</th>
                  <th className="w-32 py-2 pl-3 font-normal">Share</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 font-mono text-xs">
                      {new Date(`${d.day}T00:00:00Z`).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{d.clips}</td>
                    <td className="py-1.5 text-right tabular-nums">{Math.round(d.seconds)}s</td>
                    <td className="py-1.5 text-right tabular-nums">{d.s1Cents ? money(d.s1Cents) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{d.s2Cents ? money(d.s2Cents) : "—"}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{money(d.cents)}</td>
                    <td className="py-1.5 pl-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(d.cents / max) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right tabular-nums">{totals.clips}</td>
                  <td className="py-2 text-right tabular-nums">{Math.round(totals.seconds)}s</td>
                  <td className="py-2 text-right tabular-nums">{money(totals.s1Cents)}</td>
                  <td className="py-2 text-right tabular-nums">{money(totals.s2Cents)}</td>
                  <td className="py-2 text-right tabular-nums">{money(totals.cents)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── Top-ups ── */}
        <div className="space-y-3 rounded-lg border p-3">
          <p className="label-mono text-[11px]">Last top-up</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="topup-server">Server</Label>
              <select
                id="topup-server"
                value={form.server}
                onChange={(e) => setForm((f) => ({ ...f, server: e.target.value }))}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="1">Server 1</option>
                <option value="2">Server 2</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topup-amount">Amount ($)</Label>
              <Input
                id="topup-amount"
                inputMode="decimal"
                placeholder="100"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="h-9 w-28"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topup-date">Date</Label>
              <Input
                id="topup-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="h-9 w-40"
              />
            </div>
            <div className="min-w-40 flex-1 space-y-1.5">
              <Label htmlFor="topup-note">Note (optional)</Label>
              <Input
                id="topup-note"
                placeholder="e.g. card top-up"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="h-9"
              />
            </div>
            <Button size="sm" disabled={busy || !form.amount || !form.date} onClick={() => void addTopUp()}>
              Save top-up
            </Button>
          </div>

          {topUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No top-ups recorded yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {topUps.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Badge variant="secondary">Server {t.server}</Badge>
                  <span className="font-medium tabular-nums">{money(t.amountCents)}</span>
                  <span className="text-xs text-muted-foreground">{niceDay(t.day)}</span>
                  {t.note && <span className="text-xs text-muted-foreground">{t.note}</span>}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2 text-xs"
                    onClick={() => void removeTopUp(t.id)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
