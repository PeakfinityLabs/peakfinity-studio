"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ReferenceUploader } from "@/components/studio/reference-uploader";
import { PromptOptimizer } from "@/components/studio/prompt-optimizer";
import { fetchJson } from "@/lib/http";
import {
  formatCents,
  lipsyncCostCents,
  MODELS,
  type ModelSlug,
} from "@/lib/models/registry";

// One-step voiced generation (Kling only): pick a library voice + script and
// the app auto-chains TTS + lip-sync after the video renders.
const MAX_VOICED_SECONDS = 10;

type VoiceOption = {
  id: string;
  name: string;
  provider: "MINIMAX" | "ELEVENLABS";
  previewUrl: string | null;
};

export function GenerateForm({
  slug,
  initialParams,
}: {
  slug: ModelSlug;
  initialParams?: Record<string, unknown>;
}) {
  const def = MODELS[slug];
  const router = useRouter();
  const [params, setParams] = useState<Record<string, unknown>>({
    ...def.defaults,
    ...(initialParams ?? {}),
  });
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const supportsVoice = slug === "kling-o3";
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceScript, setVoiceScript] = useState("");

  useEffect(() => {
    if (!supportsVoice) return;
    fetchJson<{ voices: VoiceOption[] }>("/api/voices")
      .then((data) => setVoices(data.voices))
      .catch(() => setVoices([]));
  }, [supportsVoice]);

  const selectedVoice = useMemo(
    () => voices?.find((v) => v.id === voiceId) ?? null,
    [voices, voiceId]
  );

  const set = (name: string, value: unknown) =>
    setParams((prev) => ({ ...prev, [name]: value }));

  // Voiced videos are capped at 10s (Kling lip-sync limit) and the TTS audio
  // replaces the soundtrack, so Kling's own audio option is moot.
  const fields = useMemo(() => {
    if (!selectedVoice) return def.fields;
    return def.fields
      .filter((f) => f.name !== "generate_audio")
      .map((f) =>
        f.kind === "select" && f.name === "duration"
          ? { ...f, options: f.options.filter((o) => Number(o) <= MAX_VOICED_SECONDS) }
          : f
      );
  }, [def.fields, selectedVoice]);

  useEffect(() => {
    if (!selectedVoice) return;
    setParams((prev) => {
      const next: Record<string, unknown> = { ...prev, generate_audio: false };
      if (Number(prev.duration) > MAX_VOICED_SECONDS) next.duration = String(MAX_VOICED_SECONDS);
      return next;
    });
  }, [selectedVoice]);

  const estimatedCents = useMemo(() => {
    const base = def.estimateCostCents(params);
    if (!selectedVoice) return base;
    const seconds = Number(params.duration);
    return base + lipsyncCostCents(Number.isFinite(seconds) ? seconds : MAX_VOICED_SECONDS);
  }, [def, params, selectedVoice]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { ...params };
      if (originalPrompt && originalPrompt !== params.prompt) {
        body._originalPrompt = originalPrompt;
      }
      if (selectedVoice) {
        body.voiceId = selectedVoice.id;
        body.voiceScript = voiceScript.trim();
      }
      const data = await fetchJson<{ jobId: string }>(`/api/generate/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.push(`/jobs/${data.jobId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed to submit");
      setSubmitting(false);
    }
  };

  const promptMissing = def.promptRequired && !String(params.prompt ?? "").trim();
  const requiredUploadMissing = def.uploaders.some(
    (u) => u.required && !(u.single ? params[u.name] : (params[u.name] as string[])?.length)
  );
  const voiceScriptMissing = Boolean(selectedVoice) && voiceScript.trim().length < 4;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="prompt">
            Prompt{def.promptRequired ? "" : " (optional)"}
          </Label>
          <Textarea
            id="prompt"
            rows={5}
            placeholder={def.promptPlaceholder}
            value={String(params.prompt ?? "")}
            onChange={(e) => set("prompt", e.target.value)}
          />
          <PromptOptimizer
            slug={slug}
            prompt={String(params.prompt ?? "")}
            onAccept={(optimized, original) => {
              set("prompt", optimized);
              setOriginalPrompt(original);
            }}
            onRevert={(original) => {
              set("prompt", original);
              setOriginalPrompt(null);
            }}
          />
        </div>

        {def.uploaders.map((uploader) => (
          <ReferenceUploader
            key={uploader.name}
            def={uploader}
            urls={
              uploader.single
                ? typeof params[uploader.name] === "string"
                  ? [params[uploader.name] as string]
                  : []
                : ((params[uploader.name] as string[]) ?? [])
            }
            onChange={(urls) =>
              set(uploader.name, uploader.single ? (urls[0] ?? undefined) : urls)
            }
          />
        ))}
      </div>

      <div className="space-y-4">
        {supportsVoice && (
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label>Voice (optional)</Label>
                <Select
                  value={voiceId ?? "none"}
                  onValueChange={(v) => setVoiceId(v === "none" ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {selectedVoice
                        ? `${selectedVoice.name} · ${selectedVoice.provider === "ELEVENLABS" ? "ElevenLabs" : "MiniMax"}`
                        : "No voice — video only"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No voice — video only</SelectItem>
                    {(voices ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} · {v.provider === "ELEVENLABS" ? "ElevenLabs" : "MiniMax"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedVoice?.previewUrl && (
                  <audio
                    key={selectedVoice.id}
                    controls
                    preload="none"
                    src={selectedVoice.previewUrl}
                    className="h-9 w-full"
                  />
                )}
              </div>
              {selectedVoice && (
                <div className="space-y-1.5">
                  <Label htmlFor="voiceScript">Script</Label>
                  <Textarea
                    id="voiceScript"
                    rows={3}
                    maxLength={900}
                    value={voiceScript}
                    onChange={(e) => setVoiceScript(e.target.value)}
                    placeholder="Exactly what the avatar should say…"
                  />
                  <p className="text-xs text-muted-foreground">
                    After the video renders, the script is spoken in this voice and lip-synced
                    automatically (~10 extra minutes). Duration is capped at {MAX_VOICED_SECONDS}s
                    — a Kling lip-sync limit.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="space-y-4 pt-4">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                {field.kind === "select" && (
                  <>
                    <Label>{field.label}</Label>
                    <Select
                      value={params[field.name] === undefined ? "" : String(params[field.name])}
                      onValueChange={(value) => set(field.name, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="—">
                          {(() => {
                            const v = params[field.name];
                            if (v === undefined || v === "") return "—";
                            return field.optionLabels?.[String(v)] ?? String(v);
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {field.optionLabels?.[option] ?? option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                {field.kind === "number" && (
                  <>
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <Input
                      id={field.name}
                      type="number"
                      min={field.min}
                      max={field.max}
                      value={params[field.name] === undefined ? "" : String(params[field.name])}
                      onChange={(e) =>
                        set(field.name, e.target.value === "" ? undefined : Number(e.target.value))
                      }
                    />
                  </>
                )}
                {field.kind === "switch" && (
                  <div className="flex items-center justify-between">
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <Switch
                      id={field.name}
                      checked={Boolean(params[field.name])}
                      onCheckedChange={(checked) => set(field.name, checked)}
                    />
                  </div>
                )}
                {field.kind === "text" && (
                  <>
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <Input
                      id={field.name}
                      value={String(params[field.name] ?? "")}
                      onChange={(e) => set(field.name, e.target.value || undefined)}
                    />
                  </>
                )}
                {field.help ? (
                  <p className="text-xs text-muted-foreground">{field.help}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="sticky top-20">
          <CardContent className="space-y-4 pt-5">
            <div>
              <p className="label-mono mb-1">Estimated cost</p>
              <p className="text-display text-3xl tabular-nums">{formatCents(estimatedCents)}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{def.costNote}</p>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={submitting || promptMissing || requiredUploadMissing || voiceScriptMissing}
              onClick={() => void submit()}
            >
              {submitting ? "Submitting…" : selectedVoice ? "Generate + voice" : "Generate"}
            </Button>
            {requiredUploadMissing && (
              <p className="text-center text-xs text-muted-foreground">
                Add the required reference first.
              </p>
            )}
            {voiceScriptMissing && !requiredUploadMissing && (
              <p className="text-center text-xs text-muted-foreground">
                Write the script the avatar should say.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
