"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MODELS, type ModelSlug } from "@/lib/models/registry";
import { OPTIMIZER_PRESETS, PRESET_META, type OptimizerPreset } from "@/lib/optimizer/templates";

/**
 * "Optimize" button + style selector + side-by-side original/optimized compare.
 * The editor can accept, edit the optimized text before accepting, or revert.
 */
export function PromptOptimizer({
  slug,
  prompt,
  onAccept,
  onRevert,
}: {
  slug: ModelSlug;
  prompt: string;
  onAccept: (optimized: string, original: string) => void;
  onRevert: (original: string) => void;
}) {
  const isVideo = MODELS[slug].type === "VIDEO";
  // Talking-head styles only apply to video models.
  const presetOptions = OPTIMIZER_PRESETS.filter(
    (p) => !PRESET_META[p].videoOnly || isVideo
  );

  const [preset, setPreset] = useState<OptimizerPreset>("default");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<{ original: string; optimized: string } | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  const optimize = async () => {
    if (!prompt.trim()) {
      toast.error(
        preset === "default" ? "Write a rough prompt first." : "Paste the script first."
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, model: slug, preset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Optimization failed");
      setProposal({ original: prompt, optimized: data.optimizedPrompt });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Optimization failed");
    } finally {
      setBusy(false);
    }
  };

  if (proposal) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Original</p>
              <p className="rounded-md border bg-muted/40 p-2 text-sm whitespace-pre-wrap">
                {proposal.original}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Optimized (editable)</p>
              <Textarea
                rows={6}
                value={proposal.optimized}
                onChange={(e) => setProposal({ ...proposal, optimized: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onAccept(proposal.optimized, proposal.original);
                setAccepted(proposal.original);
                setProposal(null);
              }}
            >
              Use optimized
            </Button>
            <Button size="sm" variant="outline" onClick={() => setProposal(null)}>
              Discard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void optimize()}>
        {busy ? "Optimizing…" : "✨ Optimize prompt"}
      </Button>

      {presetOptions.length > 1 && (
        <Select value={preset} onValueChange={(v) => setPreset((v as OptimizerPreset) ?? "default")}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue>{PRESET_META[preset].label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {presetOptions.map((p) => (
              <SelectItem key={p} value={p}>
                <div className="flex flex-col">
                  <span>{PRESET_META[p].label}</span>
                  <span className="text-xs text-muted-foreground">{PRESET_META[p].description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {preset !== "default" && (
        <span className="text-xs text-muted-foreground">
          Put your script in the prompt box — it&apos;s kept word-for-word.
        </span>
      )}

      {accepted !== null && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            onRevert(accepted);
            setAccepted(null);
          }}
        >
          Revert to original
        </Button>
      )}
    </div>
  );
}
