"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "@/lib/creatives";

export type CreativeRow = {
  id: string;
  month: string;
  lp: string | null;
  page: string | null;
  strategist: string | null;
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
      r.launchedAt ? formatTrackerDate(r.launchedAt) : "",
      r.cogScore, r.isWinner ? "Yes" : "", r.notes,
    ].map(esc).join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}

export function TrackerView({ isAdmin, users }: { isAdmin: boolean; users: TrackerUser[] }) {
  const [rows, setRows] = useState<CreativeRow[] | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    month: ALL,
    status: ALL,
    priority: ALL,
    page: ALL,
  });
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
    return `/api/creatives?${p.toString()}`;
  }, [filters]);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ creatives: CreativeRow[]; months: string[] }>(query());
      setRows(data.creatives);
      setMonths(data.months);
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

  const remove = async (row: CreativeRow) => {
    if (!window.confirm(`Delete "${row.title}"? This can't be undone.`)) return;
    setBusyId(row.id);
    try {
      await fetchJson(`/api/creatives/${row.id}`, { method: "DELETE" });
      setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
      toast.success("Creative deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
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
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows?.length}>
            Export CSV
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                Import CSV
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                + New creative
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {rows === null ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {isAdmin
              ? "No creative matches these filters yet."
              : "Nothing is assigned to you right now."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Page</TableHead>
                    <TableHead>Strategist</TableHead>
                    <TableHead>Editor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Launched</TableHead>
                    <TableHead className="text-right">COG</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-64">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{r.title}</span>
                          {r.isWinner && <span title="Winner">🏆</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {r.briefLink && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {r.briefLink}
                            </span>
                          )}
                          {r.videoLink && (
                            <a
                              href={r.videoLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs underline-offset-4 hover:underline"
                            >
                              video ↗
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.page ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.strategist ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.editor ?? "—"}</TableCell>
                      <TableCell>
                        <Select
                          value={r.status}
                          onValueChange={(v) => void quickStatus(r, v ?? r.status)}
                          disabled={busyId === r.id}
                        >
                          <SelectTrigger size="sm" className="w-36">
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
                      </TableCell>
                      <TableCell className={`text-sm ${priorityClass(r.priority)}`}>
                        {PRIORITY_LABELS[r.priority]}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.aiModel ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {formatTrackerDate(r.launchedAt)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {r.cogScore ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busyId === r.id}
                            onClick={() => {
                              setEditing(r);
                              setDialogOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          {isAdmin && (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busyId === r.id}
                              onClick={() => void remove(r)}
                            >
                              Delete
                            </Button>
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
        isAdmin={isAdmin}
        users={users}
        defaultMonth={filters.month === ALL ? currentMonth() : filters.month}
        onSaved={() => void load()}
      />

      {isAdmin && (
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
