"use client";

import { useMemo, useState } from "react";
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
import { formatCents, MODELS, type ModelSlug } from "@/lib/models/registry";

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

  const set = (name: string, value: unknown) =>
    setParams((prev) => ({ ...prev, [name]: value }));

  const estimatedCents = useMemo(() => def.estimateCostCents(params), [def, params]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { ...params };
      if (originalPrompt && originalPrompt !== params.prompt) {
        body._originalPrompt = originalPrompt;
      }
      const res = await fetch(`/api/generate/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed to submit");
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
        <Card>
          <CardContent className="space-y-4 pt-4">
            {def.fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                {field.kind === "select" && (
                  <>
                    <Label>{field.label}</Label>
                    <Select
                      value={params[field.name] === undefined ? "" : String(params[field.name])}
                      onValueChange={(value) => set(field.name, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
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
              disabled={submitting || promptMissing || requiredUploadMissing}
              onClick={() => void submit()}
            >
              {submitting ? "Submitting…" : "Generate"}
            </Button>
            {requiredUploadMissing && (
              <p className="text-center text-xs text-muted-foreground">
                Add the required reference first.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
