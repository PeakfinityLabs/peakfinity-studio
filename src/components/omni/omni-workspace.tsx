"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { NewAvatarDialog, useAvatars } from "@/components/omni/avatar-library";
import { ClipEditor } from "@/components/omni/clip-editor";
import { PreviewDialog, type PreviewItem } from "@/components/omni/preview-dialog";
import { fetchJson } from "@/lib/http";
import { cn } from "@/lib/utils";
import {
  MAX_AVATARS,
  MAX_INGREDIENTS,
  OMNI_DURATIONS,
  OMNI_MODE_INFO,
  OMNI_MODES,
  MAX_REFERENCE_IMAGES,
  type OmniMode,
} from "@/lib/omni";

type Clip = {
  id: string;
  label: string;
  url: string;
  sourceJobId: string | null;
  trimStart: number;
  trimEnd: number | null;
};
type Generation = {
  errorMessage?: string | null;
  id: string;
  status: string;
  prompt: string;
  mode: string;
  duration: unknown;
  createdAt: string;
  outputUrl: string | null;
};
type ProjectData = {
  id: string;
  name: string;
  aspectRatio: string;
  avatarIds: string[];
  clips: Clip[];
};

const STATUS_LABEL: Record<string, string> = {
  IN_QUEUE: "Queued",
  IN_PROGRESS: "Generating",
  COMPLETED: "Ready",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function OmniWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const { avatars, reload: reloadAvatars } = useAvatars();
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);

  // Generator state
  const [mode, setMode] = useState<OmniMode>("create");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<string>("8");
  // Server 1 = main, Server 2 = backup. Remembered per browser so editors don't re-pick it.
  const [server, setServer] = useState<"1" | "2">("1");
  useEffect(() => {
    if (localStorage.getItem("omni-server") === "2") setServer("2");
  }, []);
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
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const loadedRef = useRef(false);
  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ project: ProjectData; generations: Generation[] }>(
        `/api/omni/projects/${projectId}`,
        { cache: "no-store" }
      );
      setProject(d.project);
      setGenerations(d.generations);
      loadedRef.current = true;
      return d.project;
    } catch (error) {
      // A failed background refresh keeps the page; only a failed first load leaves.
      if (loadedRef.current) return;
      toast.error(error instanceof Error ? error.message : "Could not load project");
      router.push("/omni");
    }
  }, [projectId, router]);

  // Poll while any generation is still running (the server settles it on read).
  const hasOpen = generations.some((g) => g.status === "IN_QUEUE" || g.status === "IN_PROGRESS");
  useEffect(() => {
    if (!hasOpen) return;
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [hasOpen, load]);

  // Create mode starts with the avatars picked for the project.
  useEffect(() => {
    void load().then((p) => p && setAvatarIds(p.avatarIds));
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
  // Avatars + ingredients share the provider's 10-image limit.
  const maxIngredients = Math.min(MAX_INGREDIENTS.create, MAX_REFERENCE_IMAGES - avatarIds.length);
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
          resolution: "720p",
          server,
          avatar_ids: mode === "create" ? avatarIds : [],
          image_urls: mode === "create" ? ingredients.slice(0, maxIngredients) : [],
          ...(mode === "animate" ? { image_url: photo[0] } : {}),
          ...(mode === "edit" ? { video_url: video[0] } : {}),
          ...(mode === "extend" ? { source_clip_id: extendClipId } : {}),
        }),
      });
      toast.success("Generating — the clip appears below when it's ready (usually 1–3 min).");
      setPrompt("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the request");
    } finally {
      setSubmitting(false);
    }
  };

  // Changing the Create selection also updates the project's default avatars.
  const chooseAvatars = (ids: string[]) => {
    setAvatarIds(ids);
    setProject({ ...project, avatarIds: ids });
    void fetchJson(`/api/omni/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatarIds: ids }),
    }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't save avatar choice")
    );
  };

  const commitOrder = (order: string[]) => {
    if (order.join() === clips.map((c) => c.id).join()) return;
    setProject({ ...project, clips: order.map((id) => clips.find((c) => c.id === id)!) });
    void api("/clips", { method: "PUT", body: JSON.stringify({ order }) });
  };

  const move = (index: number, delta: number) => {
    const order = clips.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    commitOrder(order);
  };

  /** Drop the dragged clip so it lands before position `before` (0..clips.length). */
  const dropAt = (before: number) => {
    if (!dragId) return;
    const order = clips.map((c) => c.id).filter((id) => id !== dragId);
    const from = clips.findIndex((c) => c.id === dragId);
    order.splice(before > from ? before - 1 : before, 0, dragId);
    commitOrder(order);
  };

  const trimClip = (clipId: string, trimStart: number, trimEnd: number | null) => {
    setProject({
      ...project,
      clips: clips.map((c) => (c.id === clipId ? { ...c, trimStart, trimEnd } : c)),
    });
    void api(`/clips/${clipId}`, { method: "PATCH", body: JSON.stringify({ trimStart, trimEnd }) });
  };

  const cutClip = (clipId: string, at: number) =>
    void api(
      `/clips/${clipId}`,
      { method: "POST", body: JSON.stringify({ at }) },
      "Clip cut in two"
    );

  const deleteGeneration = async (g: Generation) => {
    const used = clips.filter((c) => c.sourceJobId === g.id).length;
    if (
      !window.confirm(
        `Delete this generation? This can't be undone.${used ? ` It will also be removed from ${used} timeline clip${used === 1 ? "" : "s"}.` : ""}`
      )
    )
      return;
    setBusy(true);
    try {
      await fetchJson(`/api/jobs/${g.id}`, { method: "DELETE" });
      toast.success("Generation deleted");
      if (editingId && clips.some((c) => c.id === editingId && c.sourceJobId === g.id))
        setEditingId(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusy(false);
    }
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
                    onLoadedMetadata={(e) => {
                      e.currentTarget.currentTime = clips[playingAll].trimStart;
                    }}
                    onTimeUpdate={(e) => {
                      const end = clips[playingAll].trimEnd;
                      if (end !== null && e.currentTarget.currentTime >= end) {
                        e.currentTarget.pause();
                        setPlayingAll((i) => (i !== null && i + 1 < clips.length ? i + 1 : null));
                      }
                    }}
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
                <ol
                  className="flex gap-3 overflow-x-auto pb-2"
                  onDragOver={(e) => dragId && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dropIndex !== null) dropAt(dropIndex);
                    setDragId(null);
                    setDropIndex(null);
                  }}
                >
                  {clips.map((clip, i) => (
                    <li
                      key={clip.id}
                      draggable={!busy}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", clip.id);
                        setDragId(clip.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropIndex(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        setDropIndex(e.clientX < r.left + r.width / 2 ? i : i + 1);
                      }}
                      className={cn(
                        "relative shrink-0 cursor-grab space-y-1.5 active:cursor-grabbing",
                        portrait ? "w-28" : "w-44",
                        dragId === clip.id && "opacity-40"
                      )}
                    >
                      {dragId && dropIndex === i && (
                        <span className="absolute inset-y-0 -left-2 w-0.5 rounded bg-foreground" />
                      )}
                      {dragId && dropIndex === i + 1 && i === clips.length - 1 && (
                        <span className="absolute inset-y-0 -right-2 w-0.5 rounded bg-foreground" />
                      )}
                      <div
                        className={cn(
                          "relative overflow-hidden rounded-md border bg-muted",
                          editingId === clip.id && "ring-2 ring-foreground"
                        )}
                      >
                        <button
                          type="button"
                          aria-label={`Preview clip ${i + 1}`}
                          className="group/preview block w-full"
                          onClick={() =>
                            setPreview({
                              url: clip.url,
                              title: `Clip ${i + 1}: ${clip.label}`,
                              subtitle:
                                clip.trimStart > 0 || clip.trimEnd !== null
                                  ? `Trimmed ${clip.trimStart.toFixed(1)}–${clip.trimEnd === null ? "end" : `${clip.trimEnd.toFixed(1)}s`} — plays the kept part`
                                  : undefined,
                              trimStart: clip.trimStart,
                              trimEnd: clip.trimEnd,
                              downloadHref: `/api/omni/projects/${projectId}/clips/${clip.id}/download`,
                            })
                          }
                        >
                          {/* #t= paints the clip's first kept frame as the thumbnail */}
                          <video
                            src={`${clip.url}#t=${Math.max(clip.trimStart, 0.1)}`}
                            muted
                            playsInline
                            preload="metadata"
                            className={cn(
                              "pointer-events-none w-full object-cover",
                              portrait ? "aspect-[9/16]" : "aspect-video"
                            )}
                          />
                          <PlayBadge />
                        </button>
                        <span className="absolute top-1 left-1 rounded bg-background/85 px-1.5 font-mono text-[10px]">
                          {i + 1}
                        </span>
                        {(clip.trimStart > 0 || clip.trimEnd !== null) && (
                          <span className="absolute right-1 bottom-1 rounded bg-background/85 px-1.5 font-mono text-[10px]">
                            ✂ {clip.trimStart.toFixed(1)}–
                            {clip.trimEnd === null ? "end" : clip.trimEnd.toFixed(1)}s
                          </span>
                        )}
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
                        <button
                          type="button"
                          disabled={busy}
                          className="font-medium underline-offset-4 hover:underline disabled:opacity-50"
                          onClick={() => setEditingId(editingId === clip.id ? null : clip.id)}
                        >
                          {editingId === clip.id ? "Close" : "Trim / Cut"}
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
                          onClick={() => {
                            if (editingId === clip.id) setEditingId(null);
                            void api(
                              `/clips/${clip.id}`,
                              { method: "DELETE" },
                              "Removed from timeline"
                            );
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {(() => {
                const i = clips.findIndex((c) => c.id === editingId);
                if (i === -1) return null;
                return (
                  <ClipEditor
                    key={clips[i].id}
                    clip={clips[i]}
                    index={i}
                    portrait={portrait}
                    busy={busy}
                    onTrim={(a, b) => trimClip(clips[i].id, a, b)}
                    onCut={(at) => cutClip(clips[i].id, at)}
                    onClose={() => setEditingId(null)}
                  />
                );
              })()}
              {clips.length > 1 && (
                <p className="text-xs text-muted-foreground">Drag clips to reorder (or use ← →).</p>
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
                      <div
                        className={cn(
                          "flex shrink-0 items-center justify-center overflow-hidden rounded bg-muted",
                          portrait ? "h-24 w-14" : "h-14 w-24"
                        )}
                      >
                        {g.outputUrl ? (
                          <button
                            type="button"
                            aria-label="Preview generation"
                            className="group/preview relative h-full w-full"
                            onClick={() =>
                              setPreview({
                                url: g.outputUrl!,
                                title: g.prompt,
                                subtitle: `${OMNI_MODE_INFO[g.mode as OmniMode]?.label ?? g.mode} · ${new Date(g.createdAt).toLocaleString()}`,
                                downloadHref: g.outputUrl!,
                                onInsert: () =>
                                  void api(
                                    "/clips",
                                    { method: "POST", body: JSON.stringify({ jobId: g.id }) },
                                    "Inserted into timeline"
                                  ),
                              })
                            }
                          >
                            <video
                              src={`${g.outputUrl}#t=0.1`}
                              muted
                              playsInline
                              preload="metadata"
                              className="pointer-events-none h-full w-full object-cover"
                            />
                            <PlayBadge />
                          </button>
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
                        {g.status === "FAILED" && g.errorMessage && (
                          <p className="truncate text-xs text-destructive" title={g.errorMessage}>
                            {g.errorMessage}
                          </p>
                        )}
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
                      <button
                        type="button"
                        disabled={busy || g.status === "IN_PROGRESS"}
                        title={
                          g.status === "IN_PROGRESS"
                            ? "Can't delete while it's generating"
                            : undefined
                        }
                        className="text-xs text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                        onClick={() => void deleteGeneration(g)}
                      >
                        Delete
                      </button>
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
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {avatars.map((a) => {
                      const on = avatarIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-pressed={on}
                          title={a.description ? `${a.name} — ${a.description}` : a.name}
                          disabled={!on && avatarIds.length >= MAX_AVATARS}
                          onClick={() =>
                            chooseAvatars(
                              on ? avatarIds.filter((x) => x !== a.id) : [...avatarIds, a.id]
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
                    <button
                      type="button"
                      disabled={avatarIds.length >= MAX_AVATARS}
                      onClick={() => setAvatarDialogOpen(true)}
                      className="flex w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-1 text-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                    >
                      <span className="flex aspect-square w-full items-center justify-center text-xl">
                        +
                      </span>
                      <span className="block text-[10px]">New avatar</span>
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Selected avatars are saved as this project&apos;s default. Up to {MAX_AVATARS}.
                  Mention them by name in the prompt (e.g. &quot;
                  {avatars?.find((x) => avatarIds.includes(x.id))?.name.split(/[\s—,-]/)[0] ??
                    "Linda"}{" "}
                  walks in…&quot;).
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
                  label: "Video to edit (MP4)",
                  accept: "video/mp4",
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

            {mode === "create" && (
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
                <Label>Server</Label>
                <Select
                  value={server}
                  onValueChange={(v) => {
                    if (v !== "1" && v !== "2") return;
                    setServer(v);
                    try {
                      localStorage.setItem("omni-server", v);
                    } catch {
                      // private mode — still applies for this session
                    }
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Server">
                    <SelectValue>{server === "2" ? "Server 2" : "Server 1"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Server 1</SelectItem>
                    <SelectItem value="2">Server 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {project.aspectRatio} · 720p (set by the project) · Getting errors? Switch server and try again.
            </p>

            <Button
              size="lg"
              className="w-full"
              disabled={submitting || Boolean(missing)}
              onClick={() => void generate()}
            >
              {submitting ? "Submitting…" : "Generate"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {missing ??
                (mode === "edit" || mode === "extend"
                  ? "Omni Flash 1.1 · edits the last 10s of the clip"
                  : "Omni Flash 1.1 · $0.02/s ($0.16 per 8s clip)")}
            </p>
          </CardContent>
        </Card>
      </div>

      <PreviewDialog item={preview} portrait={portrait} onClose={() => setPreview(null)} />

      <NewAvatarDialog
        open={avatarDialogOpen}
        onOpenChange={setAvatarDialogOpen}
        onCreated={async (id) => {
          await reloadAvatars();
          if (avatarIds.length < MAX_AVATARS) chooseAvatars([...avatarIds, id]);
        }}
      />
    </div>
  );
}

/** Play icon over a thumbnail; brightens on hover. */
function PlayBadge() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover/preview:bg-black/30">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/85 pl-0.5 text-xs text-foreground shadow">
        ▶
      </span>
    </span>
  );
}
