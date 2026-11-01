"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

type SecretStatus = {
  slots: { id: string; title: string; hint: string; active: boolean }[];
  name: string;
  label: string;
  help: string;
  source: "database" | "environment" | "unset";
  hint: string | null;
  updatedByEmail: string | null;
  updatedAt: string | null;
};

const SOURCE_LABEL: Record<SecretStatus["source"], string> = {
  database: "set here",
  environment: "from env",
  unset: "not set",
};

export function AdminSecrets() {
  const [secrets, setSecrets] = useState<SecretStatus[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // "Add another key" form per secret: { title, value }.
  const [extra, setExtra] = useState<Record<string, { title: string; value: string }>>({});

  const slotAction = async (body: Record<string, unknown>, done: string) => {
    setBusy(String(body.secret ?? body.slotId));
    try {
      await fetchJson("/api/admin/secrets/slots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(done);
      void load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update keys");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ secrets: SecretStatus[] }>("/api/admin/secrets");
      setSecrets(data.secrets);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load API keys");
      setSecrets([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (name: string) => {
    const value = (drafts[name] ?? "").trim();
    if (!value) return;
    setBusy(name);
    try {
      await fetchJson("/api/admin/secrets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, value }),
      });
      toast.success(`${name} updated`);
      setDrafts((d) => ({ ...d, [name]: "" }));
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save key");
    } finally {
      setBusy(null);
    }
  };

  const revert = async (name: string) => {
    if (!window.confirm(`Remove the saved ${name} and fall back to the env value?`)) return;
    setBusy(name);
    try {
      await fetchJson(`/api/admin/secrets/${name}`, { method: "DELETE" });
      toast.success(`${name} reverted to env`);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revert key");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-display text-lg">API keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Rotate the keys the app uses, without a redeploy. Keys set here are encrypted and
          override the server&apos;s environment values; they take effect within ~20 seconds.
          Values are never shown again — only the last 4 characters.
        </p>

        {secrets === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            {secrets.map((s) => (
              <div key={s.name} className="rounded-lg border border-border/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{s.name}</span>
                  <Badge
                    variant={
                      s.source === "unset"
                        ? "destructive"
                        : s.source === "database"
                          ? "default"
                          : "secondary"
                    }
                    className="ml-auto"
                  >
                    {(() => {
                      const live = s.slots.find((x) => x.active);
                      return live ? `using “${live.title}” · ${live.hint}` : `${SOURCE_LABEL[s.source]}${s.hint ? ` · ${s.hint}` : ""}`;
                    })()}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.help}</p>
                {s.source === "database" && s.updatedByEmail && (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    updated by {s.updatedByEmail}
                    {s.updatedAt ? ` · ${new Date(s.updatedAt).toLocaleString()}` : ""}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder={s.source === "unset" ? "Paste key…" : "Paste new key to replace…"}
                    value={drafts[s.name] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.name]: e.target.value }))}
                    className="h-9 flex-1 min-w-[180px] font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={busy === s.name || !(drafts[s.name] ?? "").trim()}
                    onClick={() => void save(s.name)}
                  >
                    Save
                  </Button>
                  {s.source === "database" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === s.name}
                      onClick={() => void revert(s.name)}
                    >
                      Revert to env
                    </Button>
                  )}
                </div>

                {/* Extra titled keys — pick which one the app uses. */}
                {s.slots.length > 0 && (
                  <div className="mt-3 space-y-1.5" role="radiogroup" aria-label={`Key in use for ${s.label}`}>
                    <p className="label-mono text-[11px]">In use</p>
                    {[{ id: null as string | null, title: "Default key", hint: s.hint ?? "not set", active: !s.slots.some((x) => x.active) }, ...s.slots].map((k) => (
                      <div key={k.id ?? "default"} className="flex items-center gap-2 text-sm">
                        <label className="flex flex-1 cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name={`slot-${s.name}`}
                            checked={k.active}
                            disabled={busy === s.name}
                            onChange={() =>
                              void slotAction({ action: "activate", secret: s.name, slotId: k.id }, `${s.label}: using “${k.title}”`)
                            }
                          />
                          <span className={k.active ? "font-medium" : ""}>{k.title}</span>
                          <span className="font-mono text-xs text-muted-foreground">{k.hint}</span>
                        </label>
                        {k.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={busy === k.id}
                            onClick={() => {
                              if (window.confirm(`Delete the key “${k.title}”?${k.active ? " The default key will be used again." : ""}`))
                                void slotAction({ action: "delete", slotId: k.id }, `Deleted “${k.title}”`);
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    + Add another key
                  </summary>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input
                      placeholder="Title (e.g. Omni key 2)"
                      aria-label="Key title"
                      value={extra[s.name]?.title ?? ""}
                      onChange={(e) => setExtra((x) => ({ ...x, [s.name]: { title: e.target.value, value: x[s.name]?.value ?? "" } }))}
                      className="h-9 w-48 text-xs"
                    />
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Paste key…"
                      aria-label="Key value"
                      value={extra[s.name]?.value ?? ""}
                      onChange={(e) => setExtra((x) => ({ ...x, [s.name]: { title: x[s.name]?.title ?? "", value: e.target.value } }))}
                      className="h-9 flex-1 min-w-[180px] font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      disabled={busy === s.name || !extra[s.name]?.title.trim() || !extra[s.name]?.value.trim()}
                      onClick={async () => {
                        const e = extra[s.name]!;
                        const ok = await slotAction(
                          { action: "add", secret: s.name, title: e.title.trim(), value: e.value.trim(), activate: true },
                          `Added “${e.title.trim()}” — now in use for ${s.label}`
                        );
                        if (ok) setExtra((x) => ({ ...x, [s.name]: { title: "", value: "" } }));
                      }}
                    >
                      Add &amp; use
                    </Button>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
