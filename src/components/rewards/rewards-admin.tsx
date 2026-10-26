"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchJson } from "@/lib/http";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const when = (iso: string) => new Date(iso).toLocaleString();
// Native <select> styled like the app inputs (keeps this file dependency-free).
const selectCls =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** POSTs a rewards action, toasts, and refreshes the server-rendered page. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await fetchJson("/api/admin/rewards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(ok);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

type Sync = { baselineAt: string | null; lastSyncAt: string | null; lastError: string | null; rows: number } | null;

export function SyncButton({ sync }: { sync: Sync }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await fetchJson<{ rows: number; newApprovals: number; awards: number; baseline: boolean }>(
        "/api/admin/rewards",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync" }) }
      );
      toast.success(
        r.baseline
          ? `Tracking started — ${r.rows} rows read; ads already Ready won't count`
          : `Synced ${r.rows} rows · ${r.newApprovals} new approval${r.newApprovals === 1 ? "" : "s"} · ${r.awards} bonus${r.awards === 1 ? "" : "es"} awarded`
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ml-auto text-right">
      <Button onClick={() => void go()} disabled={busy}>
        {busy ? "Syncing…" : "Sync sheet"}
      </Button>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        {sync?.lastSyncAt ? `last sync ${when(sync.lastSyncAt)} · ${sync.rows} rows` : "never synced"}
        {sync?.baselineAt ? ` · tracking since ${new Date(sync.baselineAt).toLocaleDateString()}` : ""}
        {" · auto every 10 min"}
      </p>
      {sync?.lastError && <p className="mt-1 max-w-sm text-xs text-destructive">{sync.lastError}</p>}
    </div>
  );
}

type Editor = { id: string; name: string; points: number };
type Name = { sheetName: string; rows: number; counted: number; userId: string | null; userName: string | null; manual: boolean };
type Award = { id: string; userName: string; kind: string; period: string; approvals: number; cashCents: number; points: number; paidAt: string | null; revokedAt: string | null; createdAt: string };
type Item = { id: string; name: string; description: string | null; kind: string; costPoints: number; active: boolean };
type RedemptionRow = { id: string; userName: string; itemName: string; costPoints: number; status: string; createdAt: string };
type Approval = { key: string; tab: string; title: string; editorName: string | null; approvedAt: string; voidedAt: string | null };
type Ledger = { id: string; userName: string; delta: number; reason: string; createdAt: string };

export function RewardsAdmin(props: {
  editors: Editor[];
  names: Name[];
  awards: Award[];
  items: Item[];
  redemptions: RedemptionRow[];
  approvals: Approval[];
  ledger: Ledger[];
}) {
  const { busy, run } = useAction();
  const { editors } = props;

  return (
    <div className="space-y-6">
      {/* ── Bonuses ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-display text-lg">Bonuses earned</CardTitle>
        </CardHeader>
        <CardContent>
          {props.awards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bonuses yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Editor</TableHead>
                  <TableHead>Bonus</TableHead>
                  <TableHead className="text-right">Approved ads</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.awards.map((a) => (
                  <TableRow key={a.id} className={a.revokedAt ? "opacity-50" : undefined}>
                    <TableCell className="font-medium">{a.userName}</TableCell>
                    <TableCell>
                      {a.kind === "WEEKLY" ? "Weekly" : "Monthly"} · <span className="font-mono text-xs">{a.period}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.approvals}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(a.cashCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.points}</TableCell>
                    <TableCell>
                      <Badge variant={a.revokedAt ? "destructive" : a.paidAt ? "default" : "secondary"}>
                        {a.revokedAt ? "revoked" : a.paidAt ? "paid" : "unpaid"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      {!a.revokedAt && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                { action: "award", awardId: a.id, op: a.paidAt ? "unpaid" : "paid" },
                                a.paidAt ? "Marked unpaid" : "Marked paid"
                              )
                            }
                          >
                            {a.paidAt ? "Mark unpaid" : "Mark paid"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Revoke ${a.userName}'s ${a.kind.toLowerCase()} bonus for ${a.period}? Its points are taken back and it won't be re-awarded.`))
                                void run({ action: "award", awardId: a.id, op: "revoke" }, "Bonus revoked");
                            }}
                          >
                            Revoke
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Shop items={props.items} editors={editors} busy={busy} run={run} />
        <Redemptions rows={props.redemptions} busy={busy} run={run} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NameMapping names={props.names} editors={editors} busy={busy} run={run} />
        <Points editors={editors} ledger={props.ledger} busy={busy} run={run} />
      </div>

      {/* ── Counted approvals ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-display text-lg">Counted approvals</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Ads the sync saw turn Ready after tracking began (latest 100). Void one if it was marked
            Ready by mistake — it stops counting toward bonuses not yet awarded.
          </p>
          {props.approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Approved</TableHead>
                  <TableHead>Tab</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Editor (sheet)</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.approvals.map((r) => (
                  <TableRow key={r.key} className={r.voidedAt ? "opacity-50" : undefined}>
                    <TableCell className="font-mono text-xs">{when(r.approvedAt)}</TableCell>
                    <TableCell>{r.tab}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.title}</TableCell>
                    <TableCell>{r.editorName ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void run({ action: "void", key: r.key, voided: !r.voidedAt }, r.voidedAt ? "Counted again" : "Voided")}
                      >
                        {r.voidedAt ? "Restore" : "Void"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type Run = (body: Record<string, unknown>, ok: string) => Promise<boolean>;

function Shop({ items, editors, busy, run }: { items: Item[]; editors: Editor[]; busy: boolean; run: Run }) {
  const blank = { itemId: "", name: "", description: "", kind: "cash", costPoints: "", active: true };
  const [form, setForm] = useState(blank);
  const [redeemFor, setRedeemFor] = useState<Record<string, string>>({});

  const save = async () => {
    const ok = await run(
      {
        action: "item",
        ...(form.itemId ? { itemId: form.itemId } : {}),
        name: form.name,
        description: form.description,
        kind: form.kind,
        costPoints: Number(form.costPoints),
        active: form.active,
      },
      form.itemId ? "Reward updated" : "Reward added"
    );
    if (ok) setForm(blank);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-display text-lg">Reward shop</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          What editors can buy with points. Costs are placeholders until the points maths is done.
        </p>
        {items.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-lg border">
            {items.map((item) => (
              <li key={item.id} className={`flex flex-wrap items-center gap-2 p-3 ${item.active ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.name} <Badge variant="secondary">{item.kind}</Badge>
                    {!item.active && <Badge variant="outline" className="ml-1">hidden</Badge>}
                  </p>
                  {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                </div>
                <span className="font-mono text-sm tabular-nums">{item.costPoints} pts</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm({ itemId: item.id, name: item.name, description: item.description ?? "", kind: item.kind, costPoints: String(item.costPoints), active: item.active })
                  }
                >
                  Edit
                </Button>
                {item.active && (
                  <span className="flex items-center gap-1">
                    <select
                      aria-label={`Redeem ${item.name} for`}
                      className={selectCls}
                      value={redeemFor[item.id] ?? ""}
                      onChange={(e) => setRedeemFor({ ...redeemFor, [item.id]: e.target.value })}
                    >
                      <option value="">Redeem for…</option>
                      {editors.map((e) => (
                        <option key={e.id} value={e.id} disabled={e.points < item.costPoints}>
                          {e.name} ({e.points} pts)
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={busy || !redeemFor[item.id]}
                      onClick={() => void run({ action: "redeem", userId: redeemFor[item.id], itemId: item.id }, `Redeemed ${item.name}`)}
                    >
                      Redeem
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="label-mono sm:col-span-2">{form.itemId ? "Edit reward" : "Add a reward"}</p>
          <Input aria-label="Reward name" placeholder="Name (e.g. $25 cash, Hoodie)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} />
          <Input aria-label="Cost in points" placeholder="Cost (points)" type="number" min={1} value={form.costPoints} onChange={(e) => setForm({ ...form, costPoints: e.target.value })} required />
          <Input aria-label="Description" className="sm:col-span-2" placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} />
          <select aria-label="Reward type" className={selectCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="item">Item</option>
            <option value="perk">Perk</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Available in the shop
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>
              {form.itemId ? "Save changes" : "Add reward"}
            </Button>
            {form.itemId && (
              <Button type="button" size="sm" variant="outline" onClick={() => setForm(blank)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Redemptions({ rows, busy, run }: { rows: RedemptionRow[]; busy: boolean; run: Run }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-display text-lg">Redemptions</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No redemptions yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-medium">{r.userName}</span>
                <span className="text-muted-foreground">
                  {r.itemName} · {r.costPoints} pts · {new Date(r.createdAt).toLocaleDateString()}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  {r.status === "PENDING" ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => void run({ action: "redemption", redemptionId: r.id, op: "fulfill" }, "Marked fulfilled")}>
                        Fulfil
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Reject and refund ${r.costPoints} points to ${r.userName}?`))
                            void run({ action: "redemption", redemptionId: r.id, op: "reject" }, "Rejected and refunded");
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  ) : (
                    <Badge variant={r.status === "FULFILLED" ? "default" : "destructive"}>{r.status.toLowerCase()}</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NameMapping({ names, editors, busy, run }: { names: Name[]; editors: Editor[]; busy: boolean; run: Run }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-display text-lg">Sheet names → Studio accounts</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          The sheet uses first names or nicknames. Names match automatically when they&apos;re unique;
          set the rest here (e.g. Nicu → Lance). Unmatched names earn nothing.
        </p>
        {names.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sync the sheet to list its editor names.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {names.map((n) => (
              <li key={n.sheetName} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="w-28 truncate font-mono capitalize">{n.sheetName}</span>
                <span className="text-xs text-muted-foreground">
                  {n.rows} rows · {n.counted} counted
                </span>
                <span className="ml-auto w-12 text-right">
                  {n.userId && <Badge variant="secondary">{n.manual ? "set" : "auto"}</Badge>}
                </span>
                <select
                  aria-label={`Studio account for ${n.sheetName}`}
                  className={`${selectCls} w-48 ${n.userId ? "" : "border-destructive/60"}`}
                  disabled={busy}
                  value={n.userId ?? ""}
                  onChange={(e) =>
                    void run({ action: "alias", sheetName: n.sheetName, userId: e.target.value || null }, `Mapped ${n.sheetName}`)
                  }
                >
                  <option value="">— not linked —</option>
                  {editors.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Points({ editors, ledger, busy, run }: { editors: Editor[]; ledger: Ledger[]; busy: boolean; run: Run }) {
  const [form, setForm] = useState({ userId: "", delta: "", reason: "" });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-display text-lg">Points</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run({ action: "points", userId: form.userId, delta: Number(form.delta), reason: form.reason }, "Points updated"))
              setForm({ userId: "", delta: "", reason: "" });
          }}
        >
          <select aria-label="Editor" className={selectCls} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} required>
            <option value="">Editor…</option>
            {editors.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.points} pts)
              </option>
            ))}
          </select>
          <Input aria-label="Points (negative to deduct)" className="w-28" type="number" placeholder="+/- pts" value={form.delta} onChange={(e) => setForm({ ...form, delta: e.target.value })} required />
          <Input aria-label="Reason" className="min-w-40 flex-1" placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required maxLength={120} />
          <Button type="submit" size="sm" disabled={busy}>
            Apply
          </Button>
        </form>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No points activity yet.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto text-sm">
            {ledger.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1.5">
                <span className={`w-14 font-mono tabular-nums ${p.delta > 0 ? "text-primary" : "text-destructive"}`}>
                  {p.delta > 0 ? `+${p.delta}` : p.delta}
                </span>
                <span className="font-medium">{p.userName}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.reason}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
