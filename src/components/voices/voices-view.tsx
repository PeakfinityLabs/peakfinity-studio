"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AddVoiceDialog } from "@/components/voices/add-voice-dialog";
import { ImportVoiceDialog } from "@/components/voices/import-voice-dialog";
import { fetchJson } from "@/lib/http";

export type VoiceRow = {
  id: string;
  name: string;
  provider: "MINIMAX" | "ELEVENLABS";
  previewUrl: string | null;
  sampleUrl: string | null;
  createdByName: string;
  createdAt: string;
  expiresInDays: number | null;
};

export type EngineAvailability = { MINIMAX: boolean; ELEVENLABS: boolean };

const PROVIDER_LABELS: Record<VoiceRow["provider"], string> = {
  MINIMAX: "MiniMax",
  ELEVENLABS: "ElevenLabs",
};

type VoicesResponse = {
  voices: VoiceRow[];
  canManage: boolean;
  archivedCount: number;
  engines: EngineAvailability;
};

export function VoicesView() {
  const [voices, setVoices] = useState<VoiceRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [engines, setEngines] = useState<EngineAvailability>({ MINIMAX: false, ELEVENLABS: false });
  const [archivedCount, setArchivedCount] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<VoicesResponse>(
        `/api/voices${showArchived ? "?archived=1" : ""}`
      );
      setVoices(data.voices);
      setCanManage(data.canManage);
      setEngines(data.engines);
      setArchivedCount(data.archivedCount);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load voices");
      setVoices([]);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, path: string, okMessage: string) => {
    setBusyId(id);
    try {
      await fetchJson(`/api/voices/${id}${path}`, {
        method: path === "" ? "DELETE" : "POST",
      });
      toast.success(okMessage);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (archivedCount > 0 || showArchived) && (
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "← Back to voices" : `Archive (${archivedCount})`}
          </Button>
        )}
        {canManage && (
          <div className="ml-auto flex gap-2">
            {engines.ELEVENLABS && (
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                Import from ElevenLabs
              </Button>
            )}
            <Button size="sm" onClick={() => setAddOpen(true)}>
              + Add voice
            </Button>
          </div>
        )}
      </div>

      {voices === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : voices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {showArchived
              ? "No archived voices."
              : canManage
                ? "No voices yet — add the first one to get started."
                : "No voices yet. Ask an admin or strategist to add one."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map((v) => (
            <Card key={v.id}>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={v.name}>
                      {v.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      by {v.createdByName} · {new Date(v.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="secondary">{PROVIDER_LABELS[v.provider]}</Badge>
                </div>

                {v.previewUrl ? (
                  <audio controls preload="none" src={v.previewUrl} className="h-9 w-full" />
                ) : (
                  <p className="text-xs text-muted-foreground">No preview available.</p>
                )}

                <div className="flex items-center gap-2">
                  {v.provider === "MINIMAX" && v.expiresInDays !== null && !showArchived && (
                    <span
                      className={`font-mono text-xs ${
                        v.expiresInDays <= 2 ? "text-destructive" : "text-muted-foreground"
                      }`}
                      title="MiniMax deletes cloned voices unused for 7 days — Refresh keeps it alive."
                    >
                      expires in {v.expiresInDays}d
                    </span>
                  )}
                  {canManage && (
                    <div className="ml-auto flex gap-1.5">
                      {showArchived ? (
                        <Button
                          size="xs"
                          disabled={busyId === v.id}
                          onClick={() => void act(v.id, "/restore", "Voice restored")}
                        >
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busyId === v.id}
                            onClick={() => void act(v.id, "/refresh", "Preview refreshed")}
                          >
                            {busyId === v.id ? "…" : "Refresh"}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busyId === v.id}
                            onClick={() => {
                              if (window.confirm(`Archive "${v.name}"? You can restore it later.`))
                                void act(v.id, "", "Voice archived");
                            }}
                          >
                            Archive
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <>
          <AddVoiceDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            engines={engines}
            onAdded={() => void load()}
          />
          <ImportVoiceDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={() => void load()}
          />
        </>
      )}
    </div>
  );
}
