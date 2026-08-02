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
  // "swap" (default, Jonah's flow): re-voice the existing speech, no typing.
  // "script": type new lines + lip-sync re-render.
  const [mode, setMode] = useState<"swap" | "script">("swap");
  const [script, setScript] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScript("");
    setMode("swap");
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

  // Swap uses ElevenLabs speech-to-speech, so only those voices qualify.
  const eligibleVoices = useMemo(
    () => (mode === "swap" ? (voices ?? []).filter((v) => v.provider === "ELEVENLABS") : (voices ?? [])),
    [voices, mode]
  );

  useEffect(() => {
    // Keep the selection valid when the mode filters the list.
    if (voiceId && !eligibleVoices.some((v) => v.id === voiceId)) {
      setVoiceId(eligibleVoices[0]?.id ?? null);
    } else if (!voiceId && eligibleVoices.length > 0) {
      setVoiceId(eligibleVoices[0].id);
    }
  }, [eligibleVoices, voiceId]);

  const selected = useMemo(
    () => eligibleVoices.find((v) => v.id === voiceId) ?? null,
    [eligibleVoices, voiceId]
  );

  const submit = async () => {
    if (!jobId || !voiceId) return;
    if (mode === "script" && script.trim().length < 4) {
      toast.error("Write the line the avatar should say.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await fetchJson<{ jobId: string }>(`/api/jobs/${jobId}/change-voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "swap" ? { voiceId, mode } : { voiceId, mode, script: script.trim() }
        ),
      });
      toast.success(
        mode === "swap"
          ? "Voice swap started — usually under a minute"
          : "Voicing started — lip-sync takes a few minutes"
      );
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
            {mode === "swap"
              ? "Keeps exactly what the avatar already says — just swaps the voice. No typing. Runs as a new generation; the original is untouched."
              : "The avatar speaks your typed script in the chosen voice, lip-synced over this video. Runs as a new generation — the original is untouched."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={mode === "swap" ? "default" : "outline"}
              onClick={() => setMode("swap")}
            >
              Swap voice
            </Button>
            <Button
              size="sm"
              variant={mode === "script" ? "default" : "outline"}
              onClick={() => setMode("script")}
            >
              New script
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Voice</Label>
            {voices !== null && eligibleVoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {mode === "swap" && (voices?.length ?? 0) > 0
                  ? "Voice swap needs an ElevenLabs voice — import one on the Voices page."
                  : "No voices in the library yet — add or import one on the Voices page first."}
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
                  {eligibleVoices.map((v) => (
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

          {mode === "swap" ? (
            <p className="text-xs text-muted-foreground">
              Works on videos where the avatar already speaks (e.g. Kling default audio or an
              earlier voicing). Same words, same timing — lips stay in sync. Usually done in
              under a minute.
            </p>
          ) : (
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={submitting || !voiceId || eligibleVoices.length === 0}
          >
            {submitting
              ? "Working…"
              : mode === "swap"
                ? "Swap voice"
                : "Re-voice video"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
