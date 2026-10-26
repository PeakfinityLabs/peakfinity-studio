"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

export type StoreItemRow = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  costPoints: number;
  active: boolean;
  redemptions: number;
};

const selectCls =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const blank = { itemId: "", name: "", description: "", kind: "cash", costPoints: "", active: true };

/** Admin → add, edit, hide and remove Point Store items. */
export function AdminStoreItems({ items }: { items: StoreItemRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blank);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetchJson<{ ok: boolean; hidden?: boolean }>("/api/admin/rewards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
      return r;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const r = await call({
      action: "item",
      ...(form.itemId ? { itemId: form.itemId } : {}),
      name: form.name,
      description: form.description,
      kind: form.kind,
      costPoints: Number(form.costPoints),
      active: form.active,
    });
    if (r) {
      toast.success(form.itemId ? "Item updated" : "Item added to the Point Store");
      setForm(blank);
    }
  };

  const remove = async (item: StoreItemRow) => {
    const msg = item.redemptions
      ? `${item.name} has been redeemed before, so it'll be hidden from the store (history is kept). Continue?`
      : `Remove ${item.name} from the Point Store?`;
    if (!window.confirm(msg)) return;
    const r = await call({ action: "delete-item", itemId: item.id });
    if (r) toast.success(r.hidden ? `${item.name} hidden` : `${item.name} removed`);
    if (r && form.itemId === item.id) setForm(blank);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-display text-lg">Point Store items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          What editors can buy with points. Hidden items stay out of the store but keep their
          history.
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items yet — add the first one below.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-center gap-3 p-3 ${item.active ? "" : "opacity-60"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {item.name}
                    <Badge variant="secondary">{item.kind}</Badge>
                    {!item.active && <Badge variant="outline">hidden</Badge>}
                  </p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  )}
                </div>
                <span className="font-mono text-sm tabular-nums">
                  {item.costPoints.toLocaleString()} pts
                </span>
                <span className="text-xs text-muted-foreground">{item.redemptions} redeemed</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    setForm({
                      itemId: item.id,
                      name: item.name,
                      description: item.description ?? "",
                      kind: item.kind,
                      costPoints: String(item.costPoints),
                      active: item.active,
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void remove(item)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="label-mono sm:col-span-4">{form.itemId ? "Edit item" : "Add an item"}</p>
          <Input
            aria-label="Item name"
            placeholder="Name (e.g. $25 bonus, Hoodie, Day off)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            maxLength={80}
          />
          <Input
            aria-label="Cost in points"
            placeholder="Cost (points)"
            type="number"
            min={1}
            value={form.costPoints}
            onChange={(e) => setForm({ ...form, costPoints: e.target.value })}
            required
          />
          <select
            aria-label="Item type"
            className={`${selectCls} h-9`}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            <option value="cash">Cash</option>
            <option value="item">Item</option>
            <option value="perk">Perk</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            In store
          </label>
          <Input
            aria-label="Description"
            className="sm:col-span-4"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={300}
          />
          <div className="flex gap-2 sm:col-span-4">
            <Button type="submit" size="sm" disabled={busy}>
              {form.itemId ? "Save changes" : "Add item"}
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
