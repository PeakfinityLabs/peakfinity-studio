"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson } from "@/lib/http";
import type { EngineAvailability, VoiceRow } from "@/components/voices/voices-view";

const ENGINE_INFO: Record<
  VoiceRow["provider"],
  { label: string; hint: string }
> = {
  ELEVENLABS: {
    label: "ElevenLabs",
    hint: "Best quality. Use ~1 minute of clean, single-speaker audio.",
  },
  MINIMAX: {
    label: "MiniMax",
    hint: "Good quality. Needs at least 10 seconds of clean audio. Unused clones expire after 7 days (Refresh keeps them alive).",
  },
};

export function AddVoiceDialog({
  open,
  onOpenChange,
  engines,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engines: EngineAvailability;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<VoiceRow["provider"]>(
    engines.ELEVENLABS ? "ELEVENLABS" : "MINIMAX"
  );
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleName, setSampleName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [cloning, setCloning] = useState(false);

  const reset = () => {
    setName("");
    setSampleUrl(null);
    setSampleName("");
    setConsent(false);
  };

  const uploadSample = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const data = await fetchJson<{ files: Array<{ url: string; name: string }> }>(
        "/api/upload",
        { method: "POST", body: formData }
      );
      setSampleUrl(data.files[0].url);
      setSampleName(file.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    if (!name.trim() || !sampleUrl) {
      toast.error("Name the voice and upload a sample first.");
      return;
    }
    if (!consent) {
      toast.error("Confirm you have permission to clone this voice.");
      return;
    }
    setCloning(true);
    try {
      await fetchJson("/api/voices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), provider, sampleUrl, consent: true }),
      });
      toast.success("Voice cloned — preview is ready");
      onOpenChange(false);
      reset();
      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voice cloning failed");
    } finally {
      setCloning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-display">Add a voice</DialogTitle>
          <DialogDescription>
            Upload a clean sample of one person speaking; the engine clones it and generates a
            preview.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="voiceName">Name</Label>
            <Input
              id="voiceName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Sarah — warm US female"'
            />
          </div>

          <div className="space-y-1.5">
            <Label>Engine</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider((v as VoiceRow["provider"]) ?? "ELEVENLABS")}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{ENGINE_INFO[provider].label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ENGINE_INFO) as VoiceRow["provider"][]).map((p) => (
                  <SelectItem key={p} value={p} disabled={!engines[p]}>
                    <div className="flex flex-col">
                      <span>
                        {ENGINE_INFO[p].label}
                        {!engines[p] && " (not configured)"}
                      </span>
                      <span className="text-xs text-muted-foreground">{ENGINE_INFO[p].hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ENGINE_INFO[provider].hint}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="voiceSample">Voice sample</Label>
            <input
              id="voiceSample"
              type="file"
              accept="audio/*"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-foreground"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadSample(f);
              }}
            />
            {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
            {sampleUrl && !uploading && (
              <p className="font-mono text-xs text-muted-foreground">✓ {sampleName}</p>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-muted-foreground">
              I have permission from the person whose voice this is (or it&apos;s my own) to clone
              and use it for Peakfinity ads.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cloning}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={cloning || uploading}>
            {cloning ? "Cloning… (can take a minute)" : "Clone voice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
