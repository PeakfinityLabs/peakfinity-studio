"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/http";
import type { Progress } from "@/lib/rewards";

type Item = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  costPoints: number;
};
type Mine = { id: string; itemName: string; costPoints: number; status: string; createdAt: string };

const KIND_LABEL: Record<string, string> = { cash: "Cash", item: "Item", perk: "Perk" };

export function StoreView({
  progress,
  items,
  mine,
}: {
  progress: Progress;
  items: Item[];
  mine: Mine[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const post = async (body: Record<string, unknown>, ok: string) => {
    setBusy(String(body.itemId ?? body.action));
    try {
      await fetchJson("/api/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(ok);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {progress.canPrestige && (
        <Card className="border-primary/50">
          <CardContent className="flex flex-wrap items-center gap-4 py-5">
            <div className="min-w-0 flex-1">
              <p className="text-display text-lg">
                Level {progress.level} reached — prestige available
              </p>
              <p className="text-sm text-muted-foreground">
                Prestige resets you to level 1 with a P{progress.prestige + 1} badge. You keep every
                point, and you earn level-up points all over again.
              </p>
            </div>
            <Button
              disabled={busy !== null}
              onClick={() => {
                if (
                  window.confirm(
                    `Prestige to P${progress.prestige + 1}? Your level goes back to 1; your points stay.`
                  )
                )
                  void post({ action: "prestige" }, `Prestiged to P${progress.prestige + 1}`);
              }}
            >
              Prestige
            </Button>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            The store is empty. Admins can add items in Admin → Point Store items.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const short = Math.max(0, item.costPoints - progress.points);
            const pct = Math.max(
              0,
              Math.min(100, Math.round((progress.points / item.costPoints) * 100))
            );
            return (
              <Card key={item.id} className="lift flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-2">
                    <CardTitle className="text-display min-w-0 flex-1 text-lg">
                      {item.name}
                    </CardTitle>
                    <Badge variant="secondary">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                  <div className="mt-auto space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-2xl font-semibold tabular-nums">
                        {item.costPoints.toLocaleString()}
                      </span>
                      <span className="text-xs tracking-wide text-muted-foreground uppercase">
                        points
                      </span>
                    </div>
                    {/* Always rendered so prices line up across cards; full when affordable. */}
                    <div
                      className="h-1 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`${progress.points} of ${item.costPoints} points`}
                      aria-valuenow={progress.points}
                      aria-valuemin={0}
                      aria-valuemax={item.costPoints}
                    >
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <Button
                      className="w-full"
                      disabled={short > 0 || busy !== null}
                      onClick={() => {
                        if (window.confirm(`Redeem ${item.name} for ${item.costPoints} points?`))
                          void post(
                            { action: "redeem", itemId: item.id },
                            `Redeemed ${item.name} — an admin will follow up`
                          );
                      }}
                    >
                      {busy === item.id
                        ? "Redeeming…"
                        : short > 0
                          ? `${short.toLocaleString()} more points needed`
                          : "Redeem"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {mine.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-display text-lg">Your redemptions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60 text-sm">
              {mine.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <span className="font-medium">{r.itemName}</span>
                  <span className="text-muted-foreground">
                    {r.costPoints} pts · {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                  <Badge
                    className="ml-auto"
                    variant={
                      r.status === "FULFILLED"
                        ? "default"
                        : r.status === "REJECTED"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {r.status === "PENDING"
                      ? "pending"
                      : r.status === "FULFILLED"
                        ? "fulfilled"
                        : "rejected · refunded"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
