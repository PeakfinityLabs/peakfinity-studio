"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeVoiceDialog } from "@/components/jobs/change-voice-dialog";
import { fetchJson } from "@/lib/http";
import {
  formatCents,
  KLING_LIPSYNC_LABEL,
  labelForGenModel,
  MODEL_SLUGS,
  MODELS,
  VOICE_SWAP_LABEL,
} from "@/lib/models/registry";
import { isMediaExpired } from "@/lib/media";

type LibraryJob = {
  id: string;
  model: string;
  type: "IMAGE" | "VIDEO";
  status: string;
  prompt: string;
  optimizedPrompt: string | null;
  estimatedCostCents: number;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; name: string };
  assets: Array<{ id: string; url: string; contentType: string }>;
};

type JobsResponse = { jobs: LibraryJob[]; nextCursor: string | null };

const MODEL_FILTERS = [
  { value: "all", label: "All models" },
  ...MODEL_SLUGS.map((slug) => ({ value: MODELS[slug].genModel, label: MODELS[slug].label })),
  { value: "KLING_LIPSYNC", label: KLING_LIPSYNC_LABEL },
  { value: "VOICE_SWAP", label: VOICE_SWAP_LABEL },
];
const TYPE_FILTERS = [
  { value: "all", label: "Images + video" },
  { value: "IMAGE", label: "Images" },
  { value: "VIDEO", label: "Video" },
];
const DATE_FILTERS = [
  { value: "all", label: "All time" },
  { value: "1", label: "Last 24h" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];
const OWNER_FILTERS = [
  { value: "all", label: "Whole team" },
  { value: "mine", label: "Only mine" },
];

function slugFor(genModel: string) {
  return MODEL_SLUGS.find((s) => MODELS[s].genModel === genModel);
}

export function LibraryView({
  isAdmin,
  currentUserId,
}: {
  isAdmin: boolean;
  currentUserId: string;
}) {
  const [jobs, setJobs] = useState<LibraryJob[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [voiceJobId, setVoiceJobId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ model: "all", type: "all", days: "all", owner: "all" });

  const query = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (filters.model !== "all") params.set("model", filters.model);
      if (filters.type !== "all") params.set("type", filters.type);
      if (filters.days !== "all") params.set("sinceDays", filters.days);
      if (filters.owner === "mine") params.set("mine", "1");
      if (cursor) params.set("cursor", cursor);
      return `/api/jobs?${params.toString()}`;
    },
    [filters]
  );

  useEffect(() => {
    let cancelled = false;
    setJobs(null);
    fetchJson<JobsResponse>(query())
      .then((data) => {
        if (cancelled) return;
        setJobs(data.jobs ?? []);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => !cancelled && setJobs([]));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchJson<JobsResponse>(query(nextCursor));
      setJobs((prev) => [...(prev ?? []), ...(data.jobs ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const setFilter = (key: keyof typeof filters) => (value: string | null) =>
    setFilters((prev) => ({ ...prev, [key]: value ?? "all" }));

  const deleteJob = async (id: string) => {
    if (!window.confirm("Delete this generation? This can't be undone.")) return;
    setDeletingId(id);
    try {
      await fetchJson(`/api/jobs/${id}`, { method: "DELETE" });
      setJobs((prev) => (prev ?? []).filter((j) => j.id !== id));
      toast.success("Generation deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const filterDefs = [
    ["model", MODEL_FILTERS],
    ["type", TYPE_FILTERS],
    ["days", DATE_FILTERS],
    // Owner filter only matters for admins (everyone else sees only their own).
    ...(isAdmin ? ([["owner", OWNER_FILTERS]] as const) : []),
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {filterDefs.map(([key, options]) => (
          <Select key={key} value={filters[key]} onValueChange={setFilter(key)}>
            <SelectTrigger className="w-40">
              <SelectValue>
                {options.find((o) => o.value === filters[key])?.label ?? filters[key]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {jobs === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No generations match these filters yet.{" "}
            <Link href="/studio" className="text-foreground underline-offset-4 hover:underline">
              Create one in the Studio →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => {
              const slug = slugFor(job.model);
              const thumb = job.assets[0];
              return (
                <Card key={job.id} className="lift gap-0 overflow-hidden py-0">
                  <Link href={`/jobs/${job.id}`} className="block">
                    <div className="flex aspect-video items-center justify-center bg-muted">
                      {thumb ? (
                        isMediaExpired(job.completedAt, thumb.url) ? (
                          <span className="px-4 text-center text-xs text-muted-foreground">
                            media expired — re-run to regenerate
                          </span>
                        ) : thumb.contentType.startsWith("video/") ? (
                          <video src={thumb.url} muted playsInline className="h-full w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb.url} alt={job.prompt} className="h-full w-full object-cover" />
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {job.status.replace("_", " ").toLowerCase()}
                        </span>
                      )}
                    </div>
                  </Link>
                  <CardContent className="space-y-2 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{labelForGenModel(job.model)}</Badge>
                      {job.status !== "COMPLETED" && (
                        <Badge variant={job.status === "FAILED" ? "destructive" : "outline"}>
                          {job.status.replace("_", " ").toLowerCase()}
                        </Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatCents(job.estimatedCostCents)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm">{job.optimizedPrompt ?? job.prompt}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">
                        {job.user.name} · {new Date(job.createdAt).toLocaleDateString()}
                      </span>
                      <div className="flex shrink-0 items-center gap-3">
                        {job.type === "VIDEO" &&
                          job.status === "COMPLETED" &&
                          thumb &&
                          !isMediaExpired(job.completedAt, thumb.url) && (
                            <button
                              type="button"
                              onClick={() => setVoiceJobId(job.id)}
                              className="text-foreground underline-offset-4 hover:underline"
                            >
                              Change voice
                            </button>
                          )}
                        {slug && (
                          <Link
                            href={`/studio/${slug}?rerun=${job.id}`}
                            className="text-foreground underline-offset-4 hover:underline"
                          >
                            Re-run
                          </Link>
                        )}
                        {(isAdmin || job.user.id === currentUserId) && (
                          <button
                            type="button"
                            disabled={deletingId === job.id}
                            onClick={() => void deleteJob(job.id)}
                            className="text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                          >
                            {deletingId === job.id ? "Deleting…" : "Delete"}
                          </button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {nextCursor && (
            <div className="flex justify-center">
              <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      <ChangeVoiceDialog
        open={voiceJobId !== null}
        onOpenChange={(o) => !o && setVoiceJobId(null)}
        jobId={voiceJobId}
      />
    </div>
  );
}
