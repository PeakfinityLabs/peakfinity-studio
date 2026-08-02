"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/http";

type VoiceOption = {
  id: string;
  name: string;
  provider: "MINIMAX" | "ELEVENLABS";
  previewUrl: string | null;
};

const PROVIDER_LABELS = { MINIMAX: "MiniMax", ELEVENLABS: "ElevenLabs" } as const;

/**
 * Re-voice a completed video generation: pick a library voice, write the
 * script, and the avatar gets lip-synced to the new audio (a new job).
 */
export function ChangeVoiceDialog({
  open,
  onOpenChange,
  jobId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
}) {
  const router = useRouter();
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [script, setScript] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScript("");
    fetchJson<{ voices: VoiceOption[] }>("/api/voices")
      .then((data) => {
        setVoices(data.voices);
        setVoiceId((prev) => prev ?? data.voices[0]?.id ?? null);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not load voices");
        setVoices([]);
      });
  }, [open]);

  const selected = useMemo(
    () => voices?.find((v) => v.id === voiceId) ?? null,
    [voices, voiceId]
  );

  const submit = async () => {
    if (!jobId || !voiceId) return;
    if (script.trim().length < 4) {
      toast.error("Write the line the avatar should say.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await fetchJson<{ jobId: string }>(`/api/jobs/${jobId}/change-voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId, script: script.trim() }),
      });
      toast.success("Voicing started — lip-sync takes a few minutes");
      onOpenChange(false);
      router.push(`/jobs/${data.jobId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the voice change");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-display">Change voice</DialogTitle>
          <DialogDescription>
            The avatar speaks your script in the chosen voice, lip-synced over this video. Runs
            as a new generation — the original is untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Voice</Label>
            {voices !== null && voices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No voices in the library yet — add or import one on the Voices page first.
              </p>
            ) : (
              <Select value={voiceId ?? undefined} onValueChange={(v) => setVoiceId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selected
                      ? `${selected.name} · ${PROVIDER_LABELS[selected.provider]}`
                      : voices === null
                        ? "Loading voices…"
                        : "Pick a voice"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(voices ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} · {PROVIDER_LABELS[v.provider]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selected?.previewUrl && (
              <audio
                key={selected.id}
                controls
                preload="none"
                src={selected.previewUrl}
                className="h-9 w-full"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="voiceScript">Script</Label>
            <Textarea
              id="voiceScript"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={4}
              maxLength={900}
              placeholder="Exactly what the avatar should say…"
            />
            <p className="text-xs text-muted-foreground">
              Spoken audio must fit 2–60s. Source video must be 10s or shorter (Kling lip-sync
              limit). Lip-sync costs ≈7–14¢ and takes several minutes.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={submitting || !voiceId || (voices?.length ?? 0) === 0}
          >
            {submitting ? "Generating voice…" : "Re-voice video"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
