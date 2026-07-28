"use client";

import { useRef, useState } from "react";
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
import { fetchJson } from "@/lib/http";
import { currentMonth, formatMonth, STATUS_LABELS } from "@/lib/creatives";

type ImportResult = {
  committed: boolean;
  parsed: number;
  created: number;
  duplicates: number;
  skippedBlank: number;
  months: string[];
  sample: Array<{ title: string; editor: string | null; status: keyof typeof STATUS_LABELS; month: string }>;
};

export function ImportDialog({
  open,
  onOpenChange,
  defaultMonth,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMonth: string;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [month, setMonth] = useState(defaultMonth || currentMonth());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);

  const reset = () => {
    setCsv("");
    setFileName("");
    setPreview(null);
  };

  const run = async (commit: boolean) => {
    if (!csv.trim()) {
      toast.error("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    try {
      const result = await fetchJson<ImportResult>("/api/creatives/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, month, commit }),
      });
      setPreview(result);
      if (commit) {
        toast.success(`Imported ${result.created} creative${result.created === 1 ? "" : "s"}`);
        onImported();
        onOpenChange(false);
        reset();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-display">Import from CSV</DialogTitle>
          <DialogDescription>
            Export a tab from the Google Sheet as CSV (File → Download → Comma-separated
            values), then upload it here. Columns are matched by header name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="csvfile">CSV file</Label>
            <input
              ref={fileRef}
              id="csvfile"
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-foreground"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFileName(f.name);
                setCsv(await f.text());
                setPreview(null);
              }}
            />
            {fileName && (
              <p className="font-mono text-xs text-muted-foreground">{fileName}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="importMonth">Month for rows without a Month column</Label>
            <Input
              id="importMonth"
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPreview(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Sheet tabs are per-month, so their exports usually have no Month column.
            </p>
          </div>

          {preview && !preview.committed && (
            <div className="space-y-2 rounded-lg border bg-card p-3 text-sm">
              <p className="label-mono">Preview</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>
                  <span className="font-mono text-foreground">{preview.parsed}</span> rows parsed
                  {preview.months.length > 0 && (
                    <> · {preview.months.map(formatMonth).join(", ")}</>
                  )}
                </li>
                <li>
                  <span className="font-mono text-foreground">{preview.created}</span> will be
                  added
                </li>
                {preview.duplicates > 0 && (
                  <li>
                    <span className="font-mono text-foreground">{preview.duplicates}</span> already
                    in the tracker (skipped)
                  </li>
                )}
                {preview.skippedBlank > 0 && (
                  <li>
                    <span className="font-mono text-foreground">{preview.skippedBlank}</span> blank
                    rows ignored
                  </li>
                )}
              </ul>
              {preview.sample.length > 0 && (
                <div className="border-t pt-2">
                  <p className="mb-1 text-xs text-muted-foreground">First few:</p>
                  <ul className="space-y-0.5 text-xs">
                    {preview.sample.map((s, i) => (
                      <li key={i} className="truncate">
                        {s.title}
                        {s.editor ? ` · ${s.editor}` : ""} ·{" "}
                        <span className="text-muted-foreground">{STATUS_LABELS[s.status]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => void run(false)} disabled={busy || !csv}>
            {busy ? "Checking…" : "Preview"}
          </Button>
          <Button onClick={() => void run(true)} disabled={busy || !csv}>
            {busy ? "Importing…" : preview ? `Import ${preview.created}` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
