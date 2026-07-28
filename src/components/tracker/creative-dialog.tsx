"use client";

import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/http";
import {
  AI_MODELS,
  CREATIVE_PAGES,
  CREATIVE_PRIORITIES,
  CREATIVE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  currentMonth,
} from "@/lib/creatives";
import type { CreativeRow, TrackerUser } from "@/components/tracker/tracker-view";

const NONE = "__none__";

/** Empty row used when adding. */
function blankRow(month: string): Partial<CreativeRow> {
  return {
    month,
    title: "",
    status: "BACKLOG",
    priority: "NORMAL",
    contentNeeded: true,
    isWinner: false,
  };
}

export function CreativeDialog({
  open,
  onOpenChange,
  creative,
  isAdmin,
  users,
  defaultMonth,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create a new row */
  creative: CreativeRow | null;
  isAdmin: boolean;
  users: TrackerUser[];
  defaultMonth: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<CreativeRow>>(blankRow(defaultMonth));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(creative ?? blankRow(defaultMonth || currentMonth()));
  }, [creative, defaultMonth, open]);

  const set = (key: keyof CreativeRow, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (isAdmin && !String(form.title ?? "").trim()) {
      toast.error("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const clean = (v: unknown) => (v === "" || v === undefined ? null : v);
      // Editors may only send their own progress fields; admins send everything.
      const payload = isAdmin
        ? {
            month: form.month,
            title: form.title,
            lp: clean(form.lp),
            page: clean(form.page),
            strategist: clean(form.strategist),
            briefLink: clean(form.briefLink),
            editor: clean(form.editor),
            editorUserId: clean(form.editorUserId),
            videoLink: clean(form.videoLink),
            contentNeeded: form.contentNeeded ?? true,
            status: form.status,
            priority: form.priority,
            aiModel: clean(form.aiModel),
            generations: form.generations === null ? null : clean(form.generations),
            launchedAt: form.launchedAt
              ? new Date(form.launchedAt as string).toISOString()
              : null,
            cogScore: form.cogScore === null ? null : clean(form.cogScore),
            isWinner: form.isWinner ?? false,
            notes: clean(form.notes),
          }
        : {
            status: form.status,
            videoLink: clean(form.videoLink),
            generations: form.generations === null ? null : clean(form.generations),
            notes: clean(form.notes),
          };

      if (creative) {
        await fetchJson(`/api/creatives/${creative.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJson("/api/creatives", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      toast.success(creative ? "Creative updated" : "Creative added");
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const dateValue = form.launchedAt
    ? new Date(form.launchedAt as string).toISOString().slice(0, 10)
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-display">
            {creative ? form.title || "Edit creative" : "New creative"}
          </DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Brief, assign and track this concept."
              : "Update your progress — status, video link, generations and notes."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          {isAdmin && (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={String(form.title ?? "")}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. Truck Driver Cholesterol"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="month">Month</Label>
                <Input
                  id="month"
                  type="month"
                  value={String(form.month ?? "")}
                  onChange={(e) => set("month", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Page / brand</Label>
                <Select
                  value={form.page ?? NONE}
                  onValueChange={(v) => set("page", v === NONE ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{form.page ?? "—"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {CREATIVE_PAGES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="strategist">Strategist</Label>
                <Input
                  id="strategist"
                  value={String(form.strategist ?? "")}
                  onChange={(e) => set("strategist", e.target.value)}
                  placeholder="e.g. Jarrah"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editor">Editor</Label>
                <Input
                  id="editor"
                  list="tracker-editors"
                  value={String(form.editor ?? "")}
                  onChange={(e) => {
                    const name = e.target.value;
                    const match = users.find(
                      (u) => u.name.toLowerCase() === name.toLowerCase()
                    );
                    set("editor", name);
                    set("editorUserId", match?.id ?? null);
                  }}
                  placeholder="e.g. Charles"
                />
                <datalist id="tracker-editors">
                  {users.map((u) => (
                    <option key={u.id} value={u.name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lp">Landing page</Label>
                <Input
                  id="lp"
                  value={String(form.lp ?? "")}
                  onChange={(e) => set("lp", e.target.value)}
                  placeholder="Main Page, or a full URL"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="briefLink">Brief link / code</Label>
                <Input
                  id="briefLink"
                  value={String(form.briefLink ?? "")}
                  onChange={(e) => set("briefLink", e.target.value)}
                  placeholder="e.g. EK0721"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority ?? "NORMAL"}
                  onValueChange={(v) => set("priority", v ?? "NORMAL")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {PRIORITY_LABELS[(form.priority ?? "NORMAL") as keyof typeof PRIORITY_LABELS]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CREATIVE_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Shared / editor-editable fields */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status ?? "BACKLOG"}
              onValueChange={(v) => set("status", v ?? "BACKLOG")}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {STATUS_LABELS[(form.status ?? "BACKLOG") as keyof typeof STATUS_LABELS]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CREATIVE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="generations">Generations</Label>
            <Input
              id="generations"
              type="number"
              min={0}
              value={form.generations === null || form.generations === undefined ? "" : String(form.generations)}
              onChange={(e) =>
                set("generations", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="videoLink">Video link</Label>
            <Input
              id="videoLink"
              value={String(form.videoLink ?? "")}
              onChange={(e) => set("videoLink", e.target.value)}
              placeholder="https://myworkspace.krock.io/…"
            />
          </div>

          {isAdmin && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="aiModel">AI model</Label>
                <Input
                  id="aiModel"
                  list="tracker-models"
                  value={String(form.aiModel ?? "")}
                  onChange={(e) => set("aiModel", e.target.value)}
                  placeholder="e.g. Kling 3.0"
                />
                <datalist id="tracker-models">
                  {AI_MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cogScore">COG score</Label>
                <Input
                  id="cogScore"
                  type="number"
                  min={0}
                  value={form.cogScore === null || form.cogScore === undefined ? "" : String(form.cogScore)}
                  onChange={(e) =>
                    set("cogScore", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="launchedAt">Launched</Label>
                <Input
                  id="launchedAt"
                  type="date"
                  value={dateValue}
                  onChange={(e) =>
                    // Noon UTC — a calendar date that can't drift across timezones.
                    set(
                      "launchedAt",
                      e.target.value ? `${e.target.value}T12:00:00.000Z` : null
                    )
                  }
                />
              </div>

              <div className="flex items-end gap-6 pb-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="contentNeeded"
                    checked={form.contentNeeded ?? true}
                    onCheckedChange={(c) => set("contentNeeded", c)}
                  />
                  <Label htmlFor="contentNeeded">Content needed</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="isWinner"
                    checked={form.isWinner ?? false}
                    onCheckedChange={(c) => set("isWinner", c)}
                  />
                  <Label htmlFor="isWinner">Winner</Label>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              value={String(form.notes ?? "")}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : creative ? "Save changes" : "Add creative"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
