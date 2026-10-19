"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/http";

export type AvatarRow = {
  id: string;
  name: string;
  description: string | null;
  shared: boolean;
  createdAt: string;
  createdByName: string;
  mine: boolean;
  imageUrl: string;
};

/** Shared loader so the workspace picker and the library stay in step. */
export function useAvatars() {
  const [avatars, setAvatars] = useState<AvatarRow[] | null>(null);
  const reload = useCallback(async () => {
    try {
      setAvatars((await fetchJson<{ avatars: AvatarRow[] }>("/api/avatars")).avatars);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load avatars");
      setAvatars([]);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { avatars, reload };
}

/** Downscale to ≤1024px JPEG in the browser so every avatar fits the 2MB cap. */
async function toAvatarJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not read image"))),
      "image/jpeg",
      0.9
    )
  );
}

export function AvatarLibrary({
  avatars,
  reload,
  isAdmin,
}: {
  avatars: AvatarRow[] | null;
  reload: () => Promise<void>;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const update = async (a: AvatarRow, body: Record<string, unknown>, ok: string) => {
    setBusyId(a.id);
    try {
      await fetchJson(`/api/avatars/${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(ok);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const rename = (a: AvatarRow) => {
    const name = window.prompt("Rename avatar", a.name)?.trim();
    if (name && name !== a.name) void update(a, { name }, "Avatar renamed");
  };

  const remove = async (a: AvatarRow) => {
    if (!window.confirm(`Delete the avatar "${a.name}"? Nobody will be able to use it after this.`))
      return;
    setBusyId(a.id);
    try {
      await fetchJson(`/api/avatars/${a.id}`, { method: "DELETE" });
      toast.success("Avatar deleted");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-display text-xl">Avatars</h2>
          <p className="text-sm text-muted-foreground">
            Named characters for consistency across clips. Shared avatars are usable by the whole
            team; private ones only by you.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          + New avatar
        </Button>
      </div>

      {avatars === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      ) : avatars.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No avatars yet — add one from a clear photo of the character.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {avatars.map((a) => {
            const canManage = a.mine || isAdmin;
            return (
              <Card key={a.id} className="gap-0 overflow-hidden py-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.imageUrl}
                  alt={a.name}
                  className="aspect-square w-full bg-muted object-cover"
                />
                <CardContent className="space-y-1.5 p-3">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium" title={a.name}>
                      {a.name}
                    </p>
                    <Badge variant={a.shared ? "secondary" : "outline"}>
                      {a.shared ? "Shared" : "Private"}
                    </Badge>
                  </div>
                  {a.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    by {a.mine ? "you" : a.createdByName}
                  </p>
                  {canManage && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        className="underline-offset-4 hover:underline disabled:opacity-50"
                        onClick={() => rename(a)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        className="underline-offset-4 hover:underline disabled:opacity-50"
                        onClick={() =>
                          void update(
                            a,
                            { shared: !a.shared },
                            a.shared ? "Avatar is now private" : "Avatar shared with the team"
                          )
                        }
                      >
                        {a.shared ? "Make private" : "Share with team"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        className="text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                        onClick={() => void remove(a)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewAvatarDialog open={open} onOpenChange={setOpen} onCreated={reload} />
    </div>
  );
}

function NewAvatarDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shared, setShared] = useState(true);
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setShared(true);
    setImage(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const pick = async (file: File) => {
    try {
      const blob = await toAvatarJpeg(file);
      setImage(blob);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));
    } catch {
      toast.error("Couldn't read that image — try a JPG or PNG");
    }
  };

  const save = async () => {
    if (!image || name.trim().length < 2) {
      toast.error("Add a photo and a name first.");
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("image", new File([image], "avatar.jpg", { type: "image/jpeg" }));
      form.append("name", name.trim());
      if (description.trim()) form.append("description", description.trim());
      form.append("shared", shared ? "1" : "0");
      await fetchJson("/api/avatars", { method: "POST", body: form });
      toast.success(`Avatar "${name.trim()}" saved`);
      onOpenChange(false);
      reset();
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save avatar");
    } finally {
      setSaving(false);
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
          <DialogTitle className="text-display">New avatar</DialogTitle>
          <DialogDescription>
            Use a clear, well-lit photo of one person facing the camera — it&apos;s the reference
            that keeps the character consistent across clips.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-20 w-20 rounded-lg border object-cover" />
            ) : (
              <div className="h-20 w-20 rounded-lg border border-dashed bg-muted" />
            )}
            <div className="space-y-1">
              <Label htmlFor="avatarImage">Photo</Label>
              <input
                id="avatarImage"
                type="file"
                accept="image/*"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-foreground"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void pick(f);
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatarName">Name</Label>
            <Input
              id="avatarName"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Linda — 52, retired nurse"'
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatarDesc">Description (optional)</Label>
            <Textarea
              id="avatarDesc"
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Look, wardrobe, voice, personality…"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="avatarShared">Share with the team</Label>
              <p className="text-xs text-muted-foreground">Off = only you can see and use it</p>
            </div>
            <Switch id="avatarShared" checked={shared} onCheckedChange={setShared} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !image || name.trim().length < 2}>
            {saving ? "Saving…" : "Save avatar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
