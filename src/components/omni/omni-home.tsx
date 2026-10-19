"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarLibrary, useAvatars } from "@/components/omni/avatar-library";
import { fetchJson } from "@/lib/http";
import { cn } from "@/lib/utils";
import { OMNI_ASPECT_RATIOS } from "@/lib/omni";

type ProjectRow = {
  id: string;
  name: string;
  aspectRatio: string;
  updatedAt: string;
  clipCount: number;
  coverUrl: string | null;
};

export function OmniHome({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [creating, setCreating] = useState(false);
  const { avatars, reload } = useAvatars();

  useEffect(() => {
    fetchJson<{ projects: ProjectRow[] }>("/api/omni/projects")
      .then((d) => setProjects(d.projects))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Could not load projects");
        setProjects([]);
      });
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const d = await fetchJson<{ project: { id: string } }>("/api/omni/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled project", aspectRatio }),
      });
      router.push(`/omni/${d.project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create project");
      setCreating(false);
    }
  };

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-display text-xl">Your projects</h2>
            <p className="text-sm text-muted-foreground">
              Private to you — nobody else on the team can open them.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            + New project
          </Button>
        </div>
        {projects === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No projects yet. Start one to generate scenes and stitch them into a video.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Link key={p.id} href={`/omni/${p.id}`}>
                <Card className="lift gap-0 overflow-hidden py-0">
                  <div className="flex aspect-video items-center justify-center bg-muted">
                    {p.coverUrl ? (
                      <video
                        src={`${p.coverUrl}#t=0.1`}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Empty timeline</span>
                    )}
                  </div>
                  <CardContent className="space-y-1 p-3">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.aspectRatio} · {p.clipCount} clip{p.clipCount === 1 ? "" : "s"} · edited{" "}
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <AvatarLibrary avatars={avatars} reload={reload} isAdmin={isAdmin} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-display">New project</DialogTitle>
            <DialogDescription>
              The format also sets the canvas for the stitched export.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="projectName">Name</Label>
              <Input
                id="projectName"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Statin refugee — muscle pain hook"
                onKeyDown={(e) => e.key === "Enter" && void create()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="flex gap-2">
                {OMNI_ASPECT_RATIOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={aspectRatio === r}
                    onClick={() => setAspectRatio(r)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                      aspectRatio === r ? "bg-foreground text-background" : "hover:bg-accent"
                    )}
                  >
                    {r === "9:16" ? "9:16 Portrait" : "16:9 Landscape"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void create()} disabled={creating}>
              {creating ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
