"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

type AccountVoice = {
  providerVoiceId: string;
  name: string;
  category: string;
  previewUrl: string | null;
  imported: boolean;
  importedActive: boolean;
  /** Last TTS use in the ElevenLabs account, from its generation history. */
  lastUsedAt: string | null;
};

function usedAgo(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "used today";
  if (days === 1) return "used yesterday";
  if (days < 60) return `used ${days}d ago`;
  return null;
}

const CATEGORY_LABELS: Record<string, string> = {
  cloned: "Cloned",
  generated: "Generated",
  professional: "Voice library",
  premade: "Stock",
};

export function ImportVoiceDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [catalog, setCatalog] = useState<AccountVoice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCatalog = () => {
    setCatalog(null);
    setLoadError(null);
    fetchJson<{ voices: AccountVoice[] }>("/api/voices/elevenlabs")
      .then((data) => setCatalog(data.voices))
      .catch((error) => {
        setLoadError(
          error instanceof Error ? error.message : "Could not load the ElevenLabs account"
        );
      });
  };

  useEffect(() => {
    if (!open) return;
    setQuery("");
    loadCatalog();
  }, [open]);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((v) => v.name.toLowerCase().includes(q)) : catalog;
  }, [catalog, query]);

  const importVoice = async (v: AccountVoice) => {
    setBusyId(v.providerVoiceId);
    try {
      await fetchJson("/api/voices/elevenlabs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerVoiceId: v.providerVoiceId }),
      });
      toast.success(`Imported "${v.name}" — preview is ready`);
      setCatalog(
        (prev) =>
          prev?.map((c) =>
            c.providerVoiceId === v.providerVoiceId
              ? { ...c, imported: true, importedActive: true }
              : c
          ) ?? null
      );
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-display">Import from ElevenLabs</DialogTitle>
          <DialogDescription>
            Voices already in the team&apos;s ElevenLabs account (including ones cloned through
            other tools). Importing generates a preview and doesn&apos;t use the clone quota.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search voices…"
        />

        <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {loadError ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button size="sm" variant="outline" onClick={loadCatalog}>
                Retry
              </Button>
            </div>
          ) : catalog === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading the account&apos;s voices…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No voices match.</p>
          ) : (
            filtered.map((v) => (
              <div
                key={v.providerVoiceId}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={v.name}>
                    {v.name}
                  </p>
                  {usedAgo(v.lastUsedAt) && (
                    <p className="text-xs text-muted-foreground">{usedAgo(v.lastUsedAt)}</p>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {CATEGORY_LABELS[v.category] ?? v.category}
                </Badge>
                {v.imported ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {v.importedActive ? "✓ Imported" : "In archive"}
                  </span>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    className="shrink-0"
                    disabled={busyId !== null}
                    onClick={() => void importVoice(v)}
                  >
                    {busyId === v.providerVoiceId ? "Importing…" : "Import"}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
