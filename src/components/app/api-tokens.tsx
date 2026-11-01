"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

type Token = { id: string; name: string; last4: string; lastUsedAt: string | null; createdAt: string };

/** Personal API tokens for scripts. The raw value is shown once, right after creation. */
export function ApiTokens({ baseUrl }: { baseUrl: string }) {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTokens((await fetchJson<{ tokens: Token[] }>("/api/tokens")).tokens);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load tokens");
      setTokens([]);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const create = async () => {
    setBusy(true);
    try {
      const { token } = await fetchJson<{ token: { value: string } }>("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setFresh(token.value);
      setName("");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create token");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (t: Token) => {
    if (!window.confirm(`Revoke “${t.name}”? Scripts using it stop working immediately.`)) return;
    try {
      await fetchJson(`/api/tokens/${t.id}`, { method: "DELETE" });
      toast.success("Token revoked");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke token");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-display text-lg">API tokens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Lets a script on your computer use Omni Zone as you. Send it as{" "}
          <code className="font-mono text-xs">Authorization: Bearer &lt;token&gt;</code>. Treat it like a
          password: anyone with it can generate on your account.
        </p>

        {fresh && (
          <div className="rounded-lg border border-primary/50 bg-primary/5 p-3" role="status">
            <p className="text-sm font-medium">Copy your token now — it won&apos;t be shown again.</p>
            <div className="mt-2 flex gap-2">
              <Input readOnly value={fresh} aria-label="New API token" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(fresh);
                  toast.success("Copied");
                }}
              >
                Copy
              </Button>
              <Button size="sm" variant="outline" onClick={() => setFresh(null)}>
                Done
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Token name (e.g. Grok bot)"
            aria-label="Token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-64"
          />
          <Button size="sm" disabled={busy || !name.trim()} onClick={() => void create()}>
            Create token
          </Button>
        </div>

        {tokens === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="font-mono text-xs text-muted-foreground">…{t.last4}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString()}` : "never used"}
                </span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void revoke(t)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        <details>
          <summary className="cursor-pointer text-sm font-medium">API reference</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">{`Base: ${baseUrl}
Header: Authorization: Bearer <token>

GET  /api/omni/projects            → { projects: [{ id, name, aspectRatio, … }] }
GET  /api/omni/avatars             → { avatars: [{ id, name, shared, mine, … }] }
POST /api/omni/avatars             multipart: image (jpg/png/webp ≤2MB), name, shared=1|0
                                   → { avatar: { id } }

POST /api/omni/generations         JSON:
  { "project_id": "…", "mode": "create", "prompt": "…",
    "avatar_id": "…" (or "avatar_ids": [..]), "duration": 4|6|8|10,
    "server": 1|2, "image_urls": [..] (optional ingredients) }
  → 201 { "id": "…", "status": "queued" }

POST /api/omni/generations         { "items": [ …up to 50 of the above ] }
  → 207 { "results": [{ "index", "id" } | { "index", "error" }] }

GET  /api/omni/generations/<id>
  → { id, status: queued|running|ready|failed|cancelled, error,
      server, cost_usd, seconds, video_url, project_id, prompt }
  Download video_url with the same Authorization header.

Limit: 10 submissions per minute per account (same as the app).`}</pre>
        </details>
      </CardContent>
    </Card>
  );
}
