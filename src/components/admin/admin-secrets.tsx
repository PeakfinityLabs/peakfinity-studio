"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

type SecretStatus = {
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
                    {SOURCE_LABEL[s.source]}
                    {s.hint ? ` · ${s.hint}` : ""}
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
