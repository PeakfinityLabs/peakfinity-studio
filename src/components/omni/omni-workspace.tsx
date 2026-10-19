"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ReferenceUploader } from "@/components/studio/reference-uploader";
import { useAvatars } from "@/components/omni/avatar-library";
import { fetchJson } from "@/lib/http";
import { cn } from "@/lib/utils";
import {
  MAX_AVATARS,
  MAX_INGREDIENTS,
  OMNI_DURATIONS,
  OMNI_MODE_INFO,
  OMNI_MODES,
  OMNI_RESOLUTIONS,
  type OmniMode,
} from "@/lib/omni";

type Clip = { id: string; label: string; url: string; sourceJobId: string | null };
type Generation = {
  id: string;
  status: string;
  prompt: string;
  mode: string;
  duration: unknown;
  createdAt: string;
  outputUrl: string | null;
};
type ProjectData = { id: string; name: string; aspectRatio: string; clips: Clip[] };

const STATUS_LABEL: Record<string, string> = {
  IN_QUEUE: "Saved · API not connected",
  IN_PROGRESS: "Generating",
  COMPLETED: "Ready",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function OmniWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const { avatars } = useAvatars();

  // Generator state
  const [mode, setMode] = useState<OmniMode>("create");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<string>("8");
  const [resolution, setResolution] = useState<string>("720p");
  const [avatarIds, setAvatarIds] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string[]>([]);
  const [video, setVideo] = useState<string[]>([]);
  const [extendClipId, setExtendClipId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Timeline state
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [playingAll, setPlayingAll] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ project: ProjectData; generations: Generation[] }>(
        `/api/omni/projects/${projectId}`,
        { cache: "no-store" }
      );
      setProject(d.project);
      setGenerations(d.generations);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load project");
      router.push("/omni");
    }
  }, [projectId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const clips = project.clips;
  const portrait = project.aspectRatio === "9:16";
  const maxIngredients = mode === "edit" ? MAX_INGREDIENTS.edit : MAX_INGREDIENTS.create;
  const missing = !prompt.trim()
    ? "Write a prompt"
    : mode === "animate" && !photo[0]
      ? "Add the photo to animate"
      : mode === "edit" && !video[0]
        ? "Add the video to edit"
        : mode === "extend" && !extendClipId
          ? "Pick a timeline clip to extend"
          : null;

  const api = async (path: string, init: RequestInit, ok?: string) => {
    setBusy(true);
    try {
      await fetchJson(`/api/omni/projects/${projectId}${path}`, {
        ...init,
        headers: init.body ? { "content-type": "application/json" } : undefined,
      });
      if (ok) toast.success(ok);
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setSubmitting(true);
    try {
      await fetchJson(`/api/omni/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt,
          aspect_ratio: project.aspectRatio,
          duration,
          resolution,
          avatar_ids: mode === "create" ? avatarIds : [],
          image_urls:
            mode === "create" || mode === "edit" ? ingredients.slice(0, maxIngredients) : [],
          ...(mode === "animate" ? { image_url: photo[0] } : {}),
          ...(mode === "edit" ? { video_url: video[0] } : {}),
          ...(mode === "extend" ? { source_clip_id: extendClipId } : {}),
        }),
      });
      toast.success("Saved — Omni Flash isn't connected yet, so this request is queued, not run.");
      setPrompt("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the request");
    } finally {
      setSubmitting(false);
    }
  };

  const move = (index: number, delta: number) => {
    const order = clips.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    setProject({ ...project, clips: order.map((id) => clips.find((c) => c.id === id)!) });
    void api("/clips", { method: "PUT", body: JSON.stringify({ order }) });
  };

  const exportVideo = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/omni/projects/${projectId}/export`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download =
        res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? "omni-project.mp4";
      a.click();
      URL.revokeObjectURL(href);
      toast.success("Stitched video downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Uploads go through the existing /api/upload (one file per request), then onto the timeline end.
  const uploadClips = async (files: File[]) => {
    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("files", file);
        const d = await fetchJson<{ files: Array<{ url: string }> }>("/api/upload", {
          method: "POST",
          body: form,
        });
        await fetchJson(`/api/omni/projects/${projectId}/clips`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: d.files[0].url,
            label: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Uploaded clip",
          }),
        });
      }
      toast.success(`Added ${files.length} clip${files.length === 1 ? "" : "s"} to the timeline`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      await load();
    }
  };

  const playAll = () => {
    if (clips.length === 0) return;
    setPlayingAll(0);
  };

  const rename = async () => {
    const name = window.prompt("Rename project", project.name)?.trim();
    if (name && name !== project.name)
      await api("", { method: "PATCH", body: JSON.stringify({ name }) });
  };

  const removeProject = async () => {
    if (
      !window.confirm(
        `Delete "${project.name}"? The timeline is removed; your generations stay in the Library.`
      )
    )
      return;
    if (await api("", { method: "DELETE" })) router.push("/omni");
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <p className="label-mono mb-1.5">Omni Zone · {project.aspectRatio} project · private</p>
          <h1 className="text-display truncate text-2xl">{project.name}</h1>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void rename()} disabled={busy}>
            Rename
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void removeProject()}
            disabled={busy}
          >
            Delete project
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/omni">← All projects</Link>}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ─── Timeline + player ─── */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">Timeline</h2>
                <span className="text-xs text-muted-foreground">
                  {clips.length} clip{clips.length === 1 ? "" : "s"} · stitched in this order
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={playAll}
                    disabled={clips.length === 0}
                  >
                    ▶ Play all
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void exportVideo()}
                    disabled={clips.length === 0 || exporting}
                  >
                    {exporting ? "Stitching…" : "Stitch & download"}
                  </Button>
                </div>
              </div>

              {playingAll !== null && clips[playingAll] && (
                <div className="space-y-1">
                  <video
                    key={`${clips[playingAll].id}-${playingAll}`}
                    src={clips[playingAll].url}
                    autoPlay
                    controls
                    playsInline
                    onEnded={() =>
                      setPlayingAll((i) => (i !== null && i + 1 < clips.length ? i + 1 : null))
                    }
                    className={cn(
                      "mx-auto max-h-[60vh] rounded-lg bg-black",
                      portrait ? "aspect-[9/16]" : "aspect-video w-full"
                    )}
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    Clip {playingAll + 1} of {clips.length} ·{" "}
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => setPlayingAll(null)}
                    >
                      close player
                    </button>
                  </p>
                </div>
              )}

              {exporting && (
                <p className="text-xs text-muted-foreground">
                  Rendering one MP4 from {clips.length} clips — this can take a minute. Keep this
                  tab open.
                </p>
              )}

              {clips.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Insert finished generations or upload clips to build the video.
                </div>
              ) : (
                <ol className="flex gap-3 overflow-x-auto pb-2">
                  {clips.map((clip, i) => (
                    <li
                      key={clip.id}
                      className={cn("shrink-0 space-y-1.5", portrait ? "w-28" : "w-44")}
                    >
                      <div className="relative overflow-hidden rounded-md border bg-muted">
                        {/* #t=0.1 makes browsers paint a first frame as the thumbnail */}
                        <video
                          src={`${clip.url}#t=0.1`}
                          muted
                          playsInline
                          preload="metadata"
                          className={cn(
                            "w-full object-cover",
                            portrait ? "aspect-[9/16]" : "aspect-video"
                          )}
                        />
                        <span className="absolute top-1 left-1 rounded bg-background/85 px-1.5 font-mono text-[10px]">
                          {i + 1}
                        </span>
                      </div>
                      <p className="truncate text-xs" title={clip.label}>
                        {clip.label}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <button
                          type="button"
                          aria-label="Move earlier"
                          disabled={busy || i === 0}
                          onClick={() => move(i, -1)}
                          className="disabled:opacity-30"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          aria-label="Move later"
                          disabled={busy || i === clips.length - 1}
                          onClick={() => move(i, 1)}
                          className="disabled:opacity-30"
                        >
                          →
                        </button>
                        <a
                          href={`/api/omni/projects/${projectId}/clips/${clip.id}/download`}
                          className="underline-offset-4 hover:underline"
                        >
                          Download
                        </a>
                        <button
                          type="button"
                          disabled={busy}
                          className="text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                          onClick={() =>
                            void api(
                              `/clips/${clip.id}`,
                              { method: "DELETE" },
                              "Removed from timeline"
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                <Label htmlFor="clipUpload" className="text-sm">
                  Add your own clips
                </Label>
                <input
                  id="clipUpload"
                  type="file"
                  accept="video/*"
                  multiple
                  disabled={uploading}
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-foreground"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (files.length) void uploadClips(files);
                  }}
                />
                {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
              </div>
            </CardContent>
          </Card>

          {/* ─── Generations made in this project ─── */}
          <Card>
            <CardContent className="space-y-3 pt-4">
              <h2 className="font-medium">Generations in this project</h2>
              {generations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing yet — use the panel to create your first scene.
                </p>
              ) : (
                <ul className="divide-y">
                  {generations.map((g) => (
                    <li key={g.id} className="flex items-center gap-3 py-2.5">
                      <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                        {g.outputUrl ? (
                          <video
                            src={`${g.outputUrl}#t=0.1`}
                            muted
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">no video</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm" title={g.prompt}>
                          {g.prompt}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {OMNI_MODE_INFO[g.mode as OmniMode]?.label ?? g.mode}
                          {g.duration ? ` · ${String(g.duration)}s` : ""} ·{" "}
                          {new Date(g.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        variant={
                          g.status === "COMPLETED"
                            ? "default"
                            : g.status === "FAILED"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {STATUS_LABEL[g.status] ?? g.status}
                      </Badge>
                      {g.outputUrl ? (
                        <Button
                          size="xs"
                          disabled={busy}
                          onClick={() =>
                            void api(
                              "/clips",
                              { method: "POST", body: JSON.stringify({ jobId: g.id }) },
                              "Inserted into timeline"
                            )
                          }
                        >
                          Insert
                        </Button>
                      ) : (
                        <Link
                          href={`/jobs/${g.id}`}
                          className="text-xs underline-offset-4 hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Generator panel (Create / Animate / Edit / Extend) ─── */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardContent className="space-y-4 pt-4">
            <div
              className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1"
              role="tablist"
              aria-label="Generation mode"
            >
              {OMNI_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md py-1.5 text-sm font-medium transition-colors",
                    mode === m
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {OMNI_MODE_INFO[m].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{OMNI_MODE_INFO[mode].help}</p>

            {mode === "create" && (
              <div className="space-y-1.5">
                <Label>Avatars</Label>
                {avatars === null ? (
                  <Skeleton className="h-16 w-full" />
                ) : avatars.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No avatars yet —{" "}
                    <Link href="/omni" className="underline underline-offset-4">
                      add one
                    </Link>{" "}
                    for character consistency.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {avatars.map((a) => {
                      const on = avatarIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-pressed={on}
                          title={a.description ?? a.name}
                          disabled={!on && avatarIds.length >= MAX_AVATARS}
                          onClick={() =>
                            setAvatarIds((ids) =>
                              on ? ids.filter((x) => x !== a.id) : [...ids, a.id]
                            )
                          }
                          className={cn(
                            "w-16 space-y-1 rounded-lg border p-1 text-center transition-colors disabled:opacity-40",
                            on ? "border-foreground ring-2 ring-foreground/30" : "hover:bg-accent"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={a.imageUrl}
                            alt=""
                            className="aspect-square w-full rounded object-cover"
                          />
                          <span className="block truncate text-[10px]">{a.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Up to {MAX_AVATARS}. Mention them by name in the prompt (e.g. &quot;Linda walks
                  in…&quot;).
                </p>
              </div>
            )}

            {mode === "animate" && (
              <ReferenceUploader
                def={{
                  name: "image_url",
                  label: "Photo",
                  accept: "image/*",
                  max: 1,
                  single: true,
                  required: true,
                }}
                urls={photo}
                onChange={setPhoto}
              />
            )}
            {mode === "edit" && (
              <ReferenceUploader
                def={{
                  name: "video_url",
                  label: "Video to edit",
                  accept: "video/*",
                  max: 1,
                  single: true,
                  required: true,
                }}
                urls={video}
                onChange={setVideo}
              />
            )}
            {mode === "extend" && (
              <div className="space-y-1.5">
                <Label>Clip to continue</Label>
                <Select value={extendClipId} onValueChange={(v) => setExtendClipId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a timeline clip">
                      {(() => {
                        const i = clips.findIndex((c) => c.id === extendClipId);
                        return i === -1 ? "Pick a timeline clip" : `${i + 1}. ${clips[i].label}`;
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clips.map((c, i) => (
                      <SelectItem key={c.id} value={c.id}>
                        {i + 1}. {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {clips.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Insert a clip into the timeline first.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="omniPrompt">Prompt</Label>
              <Textarea
                id="omniPrompt"
                rows={5}
                maxLength={5000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === "extend"
                    ? "Describe only what happens next…"
                    : mode === "animate"
                      ? "Describe the motion and camera…"
                      : mode === "edit"
                        ? "Describe the change: swap the background, fix the lighting, add an effect…"
                        : "Subject, location, action, camera, lighting and sound…"
                }
              />
            </div>

            {(mode === "create" || mode === "edit") && (
              <ReferenceUploader
                def={{
                  name: "image_urls",
                  label: `Ingredients (optional, up to ${maxIngredients})`,
                  accept: "image/*",
                  max: maxIngredients,
                  help: "Products, logos, locations — say in the prompt where each should appear.",
                }}
                urls={ingredients}
                onChange={setIngredients}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Select value={duration} onValueChange={(v) => v && setDuration(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{duration}s</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {OMNI_DURATIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Resolution</Label>
                <Select value={resolution} onValueChange={(v) => v && setResolution(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{resolution}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {OMNI_RESOLUTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Format: {project.aspectRatio} (set by the project)
            </p>

            <Button
              size="lg"
              className="w-full"
              disabled={submitting || Boolean(missing)}
              onClick={() => void generate()}
            >
              {submitting ? "Saving…" : "Generate"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {missing ?? "Omni Flash API not connected yet — requests are saved, not run."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
