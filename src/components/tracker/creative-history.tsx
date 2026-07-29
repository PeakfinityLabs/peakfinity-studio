"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/http";

type Change = { field: string; from: unknown; to: unknown };
type Entry = {
  id: string;
  userName: string;
  action: string;
  changes: Change[] | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "added this creative",
  UPDATE: "updated",
  ARCHIVE: "archived it",
  RESTORE: "restored it",
};

const FIELD_LABELS: Record<string, string> = {
  videoLink: "video link",
  cogScore: "COG score",
  launchedAt: "launched",
  aiModel: "AI model",
  briefLink: "brief link",
  isWinner: "winner",
  contentNeeded: "content needed",
  editorUserId: "editor link",
  strategistUserId: "strategist link",
  lp: "landing page",
};

function short(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

/** Who changed what, and when — the accountability half of the safety model. */
export function CreativeHistory({ creativeId }: { creativeId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || entries) return;
    fetchJson<{ history: Entry[] }>(`/api/creatives/${creativeId}/history`)
      .then((d) => setEntries(d.history))
      .catch(() => setEntries([]));
  }, [open, entries, creativeId]);

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {open ? "Hide history" : "Show change history"}
      </button>

      {open && (
        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3">
          {entries === null ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="text-xs">
                <span className="font-medium">{e.userName}</span>{" "}
                <span className="text-muted-foreground">
                  {ACTION_LABELS[e.action] ?? e.action.toLowerCase()}
                </span>
                {e.changes && e.changes.length > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    {e.changes
                      .map(
                        (c) =>
                          `${FIELD_LABELS[c.field] ?? c.field}: ${short(c.from)} → ${short(c.to)}`
                      )
                      .join(", ")}
                  </span>
                )}
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
