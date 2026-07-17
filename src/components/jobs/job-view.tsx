"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/http";
import { formatCents, MODEL_SLUGS, MODELS } from "@/lib/models/registry";
import { FAL_MEDIA_RETENTION_DAYS, isMediaExpired } from "@/lib/media";

const POLL_MS = 3000;
const OPEN_STATUSES = ["IN_QUEUE", "IN_PROGRESS"];

type JobAsset = {
  id: string;
  kind: "INPUT" | "OUTPUT";
  url: string;
  contentType: string;
  width?: number | null;
  height?: number | null;
};

type JobData = {
  id: string;
  model: string;
  type: "IMAGE" | "VIDEO";
  status: string;
  prompt: string;
  optimizedPrompt: string | null;
  estimatedCostCents: number;
  errorMessage: string | null;
  logs: unknown;
  queuePosition: number | null;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; name: string };
  assets: JobAsset[];
};

function statusBadgeVariant(status: string) {
  switch (status) {
    case "COMPLETED":
      return "default" as const;
    case "FAILED":
      return "destructive" as const;
    case "CANCELLED":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

function logLines(logs: unknown): string[] {
  if (!Array.isArray(logs)) return [];
  return logs
    .map((entry) =>
      entry && typeof entry === "object" && "message" in entry
        ? String((entry as { message: unknown }).message)
        : typeof entry === "string"
          ? entry
          : ""
    )
    .filter(Boolean)
    .slice(-8);
}

export function JobView({
  jobId,
  isAdmin,
  currentUserId,
}: {
  jobId: string;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobData | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchJob = useCallback(async () => {
    let status: string | undefined;
    try {
      const data = await fetchJson<{ job: JobData }>(`/api/jobs/${jobId}`, { cache: "no-store" });
      setJob(data.job);
      status = data.job.status;
    } catch {
      // Transient error (server restart, blip) — keep polling so the job still
      // resolves once the server is back, rather than stalling.
      status = "IN_PROGRESS";
    }
    if (status && OPEN_STATUSES.includes(status)) {
      timer.current = setTimeout(() => void fetchJob(), POLL_MS);
    }
  }, [jobId]);

  useEffect(() => {
    void fetchJob();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fetchJob]);

  const cancel = async () => {
    setCancelling(true);
    try {
      await fetchJson(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      toast.success("Job cancelled");
      void fetchJob();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel");
    } finally {
      setCancelling(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this generation? This can't be undone.")) return;
    setDeleting(true);
    try {
      await fetchJson(`/api/jobs/${jobId}`, { method: "DELETE" });
      toast.success("Generation deleted");
      router.push("/library");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
      setDeleting(false);
    }
  };

  if (!job) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const def = MODEL_SLUGS.map((s) => MODELS[s]).find((m) => m.genModel === job.model);
  const isOpen = OPEN_STATUSES.includes(job.status);
  const outputs = job.assets.filter((a) => a.kind === "OUTPUT");
  const lines = logLines(job.logs);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="label-mono mb-1">
            {job.type === "VIDEO" ? "Video" : "Image"} ·{" "}
            <span className="font-mono normal-case">{formatCents(job.estimatedCostCents)}</span> · by{" "}
            {job.user.name}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="text-display text-2xl">{def?.label ?? job.model}</h1>
            <Badge variant={statusBadgeVariant(job.status)}>{job.status.replace("_", " ")}</Badge>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {isOpen && (
            <Button variant="outline" size="sm" disabled={cancelling} onClick={() => void cancel()}>
              {cancelling ? "Cancelling…" : "Cancel"}
            </Button>
          )}
          {def && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link href={`/studio/${def.slug}?rerun=${job.id}`}>Re-run with same settings</Link>
              }
            />
          )}
          {!isOpen && (isAdmin || job.user.id === currentUserId) && (
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={() => void remove()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-1 pt-4 text-sm">
          <p className="whitespace-pre-wrap">{job.optimizedPrompt ?? job.prompt}</p>
          {job.optimizedPrompt && (
            <p className="text-xs text-muted-foreground">
              Optimized from: <span className="whitespace-pre-wrap">{job.prompt}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {isOpen && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center gap-3">
              <Progress value={job.status === "IN_PROGRESS" ? 66 : 25} className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {job.status === "IN_QUEUE"
                  ? job.queuePosition !== null
                    ? `Queued — position ${job.queuePosition}`
                    : "Queued"
                  : "Generating…"}
              </span>
            </div>
            {lines.length > 0 && (
              <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
                {lines.join("\n")}
              </pre>
            )}
            {job.type === "VIDEO" && (
              <p className="text-xs text-muted-foreground">
                Video jobs can take several minutes — you can leave this page; the job keeps
                running and lands in the Library.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {job.status === "FAILED" && (
        <Card className="border-destructive/50">
          <CardContent className="pt-4 text-sm text-destructive">
            {job.errorMessage ?? "Generation failed."}
          </CardContent>
        </Card>
      )}

      {outputs.length > 0 && (
        <>
          {outputs.some((a) => !a.url.startsWith("/api/media/")) &&
            !outputs.some((a) => isMediaExpired(job.completedAt, a.url)) && (
              <p className="text-xs text-muted-foreground">
                Download what you want to keep — fal removes generated files after ~
                {FAL_MEDIA_RETENTION_DAYS} days.
              </p>
            )}
          <div className="grid gap-4 sm:grid-cols-2">
            {outputs.map((asset) => {
              const expired = isMediaExpired(job.completedAt, asset.url);
              return (
                <Card key={asset.id} className="overflow-hidden">
                  <CardContent className="space-y-2 p-2">
                    {expired ? (
                      <div className="flex aspect-video items-center justify-center rounded-md bg-muted px-4 text-center text-sm text-muted-foreground">
                        Media expired — fal keeps generated files ~{FAL_MEDIA_RETENTION_DAYS} days.
                        Re-run the job to regenerate.
                      </div>
                    ) : asset.contentType.startsWith("video/") ? (
                      <video src={asset.url} controls className="w-full rounded-md" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.url} alt={job.prompt} className="w-full rounded-md" />
                    )}
                    <div className="flex items-center justify-between px-1 pb-1">
                      <span className="text-xs text-muted-foreground">
                        {asset.width && asset.height
                          ? `${asset.width}×${asset.height}`
                          : asset.contentType}
                      </span>
                      {!expired && (
                        <Button
                          variant="outline"
                          size="xs"
                          nativeButton={false}
                          render={
                            <a href={asset.url} download>
                              Download
                            </a>
                          }
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
