"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreativeDialog } from "@/components/tracker/creative-dialog";
import { ImportDialog } from "@/components/tracker/import-dialog";
import { fetchJson } from "@/lib/http";
import {
  CREATIVE_PAGES,
  CREATIVE_PRIORITIES,
  CREATIVE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  currentMonth,
  formatMonth,
  formatTrackerDate,
  type TrackerCaps,
} from "@/lib/creatives";

export type CreativeRow = {
  id: string;
  month: string;
  lp: string | null;
  page: string | null;
  strategist: string | null;
  strategistUserId: string | null;
  title: string;
  briefLink: string | null;
  editor: string | null;
  editorUserId: string | null;
  videoLink: string | null;
  contentNeeded: boolean;
  status: keyof typeof STATUS_LABELS;
  priority: keyof typeof PRIORITY_LABELS;
  aiModel: string | null;
  generations: number | null;
  launchedAt: string | null;
  cogScore: number | null;
  isWinner: boolean;
  notes: string | null;
};

export type TrackerUser = { id: string; name: string; jobTitle: string | null };

const ALL = "all";

function statusVariant(status: CreativeRow["status"]) {
  if (status === "READY") return "default" as const;
  if (status === "NEEDS_REVISION") return "destructive" as const;
  return "secondary" as const;
}

function priorityClass(p: CreativeRow["priority"]) {
  if (p === "URGENT") return "font-semibold text-foreground";
  if (p === "IMPORTANT") return "text-foreground/80";
  return "text-muted-foreground";
}

function toCsv(rows: CreativeRow[]): string {
  const headers = [
    "Month", "LP", "Page", "Strategist", "Title", "Brief Link", "Editor",
    "Video Link", "Content Needed?", "Status", "Priority", "AI Model",
    "Generations", "Launched", "COG Score", "Winner", "Notes",
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.month, r.lp, r.page, r.strategist, r.title, r.briefLink, r.editor,
      r.videoLink, r.contentNeeded ? "Yes" : "No", STATUS_LABELS[r.status],
      PRIORITY_LABELS[r.priority], r.aiModel, r.generations,
      // ISO, not a locale string: an export must re-import identically
      // regardless of the browser's date format.
      r.launchedAt ? new Date(r.launchedAt).toISOString().slice(0, 10) : "",
      r.cogScore, r.isWinner ? "Yes" : "", r.notes,
    ].map(esc).join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}

const DEFAULT_CAPS: TrackerCaps = {
  canSeeAll: false,
  canEditAllFields: false,
  canArchive: false,
  tier: "editor",
};

export function TrackerView({ users }: { users: TrackerUser[] }) {
  const [caps, setCaps] = useState<TrackerCaps>(DEFAULT_CAPS);
  const [rows, setRows] = useState<CreativeRow[] | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    month: ALL,
    status: ALL,
    priority: ALL,
    page: ALL,
  });
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<CreativeRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.month !== ALL) p.set("month", filters.month);
    if (filters.status !== ALL) p.set("status", filters.status);
    if (filters.priority !== ALL) p.set("priority", filters.priority);
    if (filters.page !== ALL) p.set("page", filters.page);
    if (showArchived) p.set("archived", "1");
    return `/api/creatives?${p.toString()}`;
  }, [filters, showArchived]);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{
        creatives: CreativeRow[];
        months: string[];
        caps: TrackerCaps;
        archivedCount: number;
      }>(query());
      setRows(data.creatives);
      setMonths(data.months);
      setCaps(data.caps);
      setArchivedCount(data.archivedCount ?? 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the tracker");
      setRows([]);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const launched = list.filter((r) => r.launchedAt).length;
    const scores = list.map((r) => r.cogScore).filter((s): s is number => typeof s === "number");
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return {
      total: list.length,
      ready: list.filter((r) => r.status === "READY").length,
      inProgress: list.filter((r) => r.status === "EDITING" || r.status === "SCRIPTING").length,
      needsReview: list.filter(
        (r) => r.status === "NEEDS_REVIEW" || r.status === "NEEDS_REVISION"
      ).length,
      launched,
      avgCog: avg,
    };
  }, [rows]);

  const saveVideoLink = async (row: CreativeRow, videoLink: string) => {
    const value = videoLink.trim();
    if ((row.videoLink ?? "") === value) return;
    setBusyId(row.id);
    try {
      await fetchJson(`/api/creatives/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoLink: value || null }),
      });
      setRows((prev) =>
        (prev ?? []).map((r) => (r.id === row.id ? { ...r, videoLink: value || null } : r))
      );
      toast.success("Video link saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the video link");
      void load();
    } finally {
      setBusyId(null);
    }
  };

  const quickStatus = async (row: CreativeRow, status: string) => {
    setBusyId(row.id);
    try {
      await fetchJson(`/api/creatives/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setRows((prev) =>
        (prev ?? []).map((r) =>
          r.id === row.id ? { ...r, status: status as CreativeRow["status"] } : r
        )
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update status");
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (row: CreativeRow) => {
    setBusyId(row.id);
    try {
      await fetchJson(`/api/creatives/${row.id}/restore`, { method: "POST" });
      setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
      setArchivedCount((n) => Math.max(0, n - 1));
      toast.success("Restored to the tracker");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore");
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (row: CreativeRow) => {
    if (
      !window.confirm(
        `Archive "${row.title}"?\n\nIt's removed from the tracker but kept — you can restore it from the archive at any time.`
      )
    )
      return;
    setBusyId(row.id);
    try {
      await fetchJson(`/api/creatives/${row.id}`, { method: "DELETE" });
      setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
      setArchivedCount((n) => n + 1);
      toast.success("Archived — restorable from the archive");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive");
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const csv = toCsv(rows ?? []);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `creative-tracker-${filters.month === ALL ? "all" : filters.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterDefs = [
    { key: "month" as const, all: "All months", options: months.map((m) => ({ value: m, label: formatMonth(m) })) },
    { key: "status" as const, all: "All statuses", options: CREATIVE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })) },
    { key: "priority" as const, all: "All priorities", options: CREATIVE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })) },
    { key: "page" as const, all: "All pages", options: CREATIVE_PAGES.map((p) => ({ value: p, label: p })) },
  ];

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total", value: stats.total },
          { label: "In progress", value: stats.inProgress },
          { label: "Needs review", value: stats.needsReview },
          { label: "Ready", value: stats.ready },
          { label: "Launched", value: stats.launched },
          { label: "Avg COG", value: stats.avgCog ?? "—" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-3">
              <p className="label-mono">{s.label}</p>
              <p className="text-display mt-1 text-2xl tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {filterDefs.map((f) => (
          <Select
            key={f.key}
            value={filters[f.key]}
            onValueChange={(v) => setFilters((prev) => ({ ...prev, [f.key]: v ?? ALL }))}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue>
                {filters[f.key] === ALL
                  ? f.all
                  : (f.options.find((o) => o.value === filters[f.key])?.label ?? filters[f.key])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{f.all}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <div className="ml-auto flex gap-2">
          {caps.canArchive && (archivedCount > 0 || showArchived) && (
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "← Back to tracker" : `Archive (${archivedCount})`}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows?.length}>
            Export CSV
          </Button>
          {caps.canEditAllFields && (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
          )}
          {/* Anyone can add — adding is safe, and every row is attributed. */}
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            + New creative
          </Button>
        </div>
      </div>

      {/* Table */}
      {rows === null ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {caps.canSeeAll
              ? "No creative matches these filters yet."
              : "Nothing here yet — add a creative to get started."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Denser 7-column layout: related fields are stacked inside a
                cell rather than each taking a column, so the board fits without
                horizontal scrolling on a normal laptop. The Creative column is
                sticky so context survives if narrow screens do scroll. */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-card">
                  <TableRow>
                    <TableHead className="sticky left-0 z-30 min-w-64 bg-card">Creative</TableHead>
                    <TableHead className="min-w-36">Team</TableHead>
                    <TableHead className="min-w-32">Status</TableHead>
                    <TableHead className="min-w-20">Priority</TableHead>
                    <TableHead className="min-w-52">Video link</TableHead>
                    <TableHead className="min-w-28">Performance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      {/* Creative: title + brief code + brand, sticky on scroll */}
                      <TableCell className="sticky left-0 z-10 max-w-72 bg-card">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium" title={r.title}>
                            {r.title}
                          </span>
                          {r.isWinner && <span title="Winner">🏆</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {r.page && <span className="truncate">{r.page}</span>}
                          {r.briefLink && (
                            <span className="truncate font-mono" title={r.briefLink}>
                              {r.briefLink}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Team: strategist over editor */}
                      <TableCell className="text-xs">
                        <div className="truncate" title={`Strategist: ${r.strategist ?? "—"}`}>
                          <span className="text-muted-foreground">S</span> {r.strategist ?? "—"}
                        </div>
                        <div className="truncate" title={`Editor: ${r.editor ?? "—"}`}>
                          <span className="text-muted-foreground">E</span> {r.editor ?? "—"}
                        </div>
                      </TableCell>

                      <TableCell>
                        {caps.canEditAllFields && !showArchived ? (
                          <Select
                            value={r.status}
                            onValueChange={(v) => void quickStatus(r, v ?? r.status)}
                            disabled={busyId === r.id}
                          >
                            <SelectTrigger size="sm" className="w-32">
                              <SelectValue>
                                <Badge variant={statusVariant(r.status)}>
                                  {STATUS_LABELS[r.status]}
                                </Badge>
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
                        ) : (
                          <Badge variant={statusVariant(r.status)}>
                            {STATUS_LABELS[r.status]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-sm ${priorityClass(r.priority)}`}>
                        {PRIORITY_LABELS[r.priority]}
                      </TableCell>
                      {/* The one field every editor can change. */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Input
                            defaultValue={r.videoLink ?? ""}
                            placeholder={showArchived ? "" : "Paste video link…"}
                            // Archived rows are read-only; PATCH would 409.
                            disabled={busyId === r.id || showArchived}
                            className="h-7 text-xs"
                            onBlur={(e) => void saveVideoLink(r, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                          />
                          {r.videoLink && (
                            <a
                              href={r.videoLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                              title="Open video"
                            >
                              ↗
                            </a>
                          )}
                        </div>
                      </TableCell>
                      {/* Performance: model, launch date and COG stacked */}
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.aiModel && (
                          <div className="truncate" title={r.aiModel}>
                            {r.aiModel}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {r.launchedAt && <span>{formatTrackerDate(r.launchedAt)}</span>}
                          {r.cogScore !== null && (
                            <span className="text-foreground tabular-nums" title="COG score">
                              {r.cogScore}
                            </span>
                          )}
                        </div>
                        {!r.aiModel && !r.launchedAt && r.cogScore === null && <span>—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {showArchived ? (
                            <Button
                              size="xs"
                              disabled={busyId === r.id}
                              onClick={() => void restore(r)}
                            >
                              Restore
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={busyId === r.id}
                                onClick={() => {
                                  setEditing(r);
                                  setDialogOpen(true);
                                }}
                              >
                                {caps.canEditAllFields ? "Edit" : "Details"}
                              </Button>
                              {caps.canArchive && (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  disabled={busyId === r.id}
                                  onClick={() => void archive(r)}
                                >
                                  Archive
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <CreativeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        creative={editing}
        canEditAll={caps.canEditAllFields}
        users={users}
        defaultMonth={filters.month === ALL ? currentMonth() : filters.month}
        onSaved={() => void load()}
      />

      {caps.canEditAllFields && (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          defaultMonth={filters.month === ALL ? currentMonth() : filters.month}
          onImported={() => void load()}
        />
      )}
    </div>
  );
}
