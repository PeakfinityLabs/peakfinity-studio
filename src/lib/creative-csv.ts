import type { CreativePriority, CreativeStatus } from "@/generated/prisma/enums";

/** RFC4180-ish CSV parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const src = text.replace(/^﻿/, ""); // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const STATUS_MAP: Record<string, CreativeStatus> = {
  "": "BACKLOG",
  backlog: "BACKLOG",
  scripting: "SCRIPTING",
  editing: "EDITING",
  "needs review": "NEEDS_REVIEW",
  "needs revision": "NEEDS_REVISION",
  ready: "READY",
};

const PRIORITY_MAP: Record<string, CreativePriority> = {
  "": "NORMAL",
  normal: "NORMAL",
  important: "IMPORTANT",
  urgent: "URGENT",
};

/** Header aliases — tolerant of case, spacing and the sheet's "Breif Link" typo. */
const HEADER_ALIASES: Record<string, string[]> = {
  month: ["month"],
  lp: ["lp", "landing page"],
  page: ["page", "brand"],
  strategist: ["strategist"],
  title: ["title", "concept", "name"],
  briefLink: ["brief link", "breif link", "brief", "brief code"],
  editor: ["editor"],
  videoLink: ["video link", "video"],
  contentNeeded: ["content needed?", "content needed"],
  status: ["status"],
  priority: ["priority"],
  aiModel: ["ai model", "ai manager", "model"],
  generations: ["generations"],
  launchedAt: ["launched", "launch date", "launched at"],
  cogScore: ["cog score", "cog"],
  isWinner: ["winner", "winners:", "winners"],
  notes: ["notes", "note"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Maps header row → { field: columnIndex }. Unknown columns are ignored. */
export function mapHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((raw, i) => {
    const h = norm(raw);
    if (!h) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(h)) {
        map[field] = i;
        return;
      }
    }
  });
  return map;
}

/** "7/24/26", "7/10/2026" or "2026-07-24" → noon-UTC Date (calendar date). */
export function parseSheetDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    return new Date(Date.UTC(year, Number(us[1]) - 1, Number(us[2]), 12));
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
  }
  return null;
}

export type ParsedCreative = {
  month: string;
  lp: string | null;
  page: string | null;
  strategist: string | null;
  title: string;
  briefLink: string | null;
  editor: string | null;
  videoLink: string | null;
  contentNeeded: boolean;
  status: CreativeStatus;
  priority: CreativePriority;
  aiModel: string | null;
  generations: number | null;
  launchedAt: Date | null;
  cogScore: number | null;
  isWinner: boolean;
  notes: string | null;
};

export type CsvParseResult = {
  rows: ParsedCreative[];
  /** Rows skipped because they had no title (blank/spacer rows in the sheet). */
  skippedBlank: number;
  /** True when the CSV had no recognisable Title column. */
  missingTitleColumn: boolean;
};

/**
 * Parses a creative-tracker CSV. `fallbackMonth` is used for rows without a
 * Month column — Google Sheets tabs are per-month, so exports usually lack it.
 */
export function parseCreativeCsv(text: string, fallbackMonth: string): CsvParseResult {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim().length > 0));
  if (table.length === 0) return { rows: [], skippedBlank: 0, missingTitleColumn: true };

  // The header may not be the first line (sheets often have a title row above).
  let headerIdx = 0;
  let map = mapHeaders(table[0]);
  if (map.title === undefined) {
    for (let i = 1; i < Math.min(table.length, 5); i++) {
      const candidate = mapHeaders(table[i]);
      if (candidate.title !== undefined) {
        headerIdx = i;
        map = candidate;
        break;
      }
    }
  }
  if (map.title === undefined) return { rows: [], skippedBlank: 0, missingTitleColumn: true };

  const cell = (r: string[], field: string): string => {
    const i = map[field];
    return i === undefined ? "" : (r[i] ?? "").trim();
  };
  const nn = (v: string) => (v.length > 0 ? v : null);

  const rows: ParsedCreative[] = [];
  let skippedBlank = 0;

  for (let i = headerIdx + 1; i < table.length; i++) {
    const r = table[i];
    const title = cell(r, "title");
    if (!title) {
      skippedBlank++;
      continue;
    }
    const monthRaw = cell(r, "month");
    const month = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : fallbackMonth;
    const gen = cell(r, "generations");
    const cog = cell(r, "cogScore");

    rows.push({
      month,
      lp: nn(cell(r, "lp")),
      page: nn(cell(r, "page")),
      strategist: nn(cell(r, "strategist")),
      title,
      briefLink: nn(cell(r, "briefLink")),
      editor: nn(cell(r, "editor")),
      videoLink: nn(cell(r, "videoLink")),
      contentNeeded: norm(cell(r, "contentNeeded")) !== "no",
      status: STATUS_MAP[norm(cell(r, "status"))] ?? "BACKLOG",
      priority: PRIORITY_MAP[norm(cell(r, "priority"))] ?? "NORMAL",
      aiModel: nn(cell(r, "aiModel")),
      generations: /^\d+$/.test(gen) ? Number(gen) : null,
      launchedAt: parseSheetDate(cell(r, "launchedAt")),
      cogScore: /^\d+$/.test(cog) ? Number(cog) : null,
      isWinner: Boolean(nn(cell(r, "isWinner"))),
      notes: nn(cell(r, "notes")),
    });
  }

  return { rows, skippedBlank, missingTitleColumn: false };
}
