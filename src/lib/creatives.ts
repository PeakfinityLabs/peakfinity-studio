import type { CreativePriority, CreativeStatus } from "@/generated/prisma/enums";

// Labels mirror the wording the team already used in the tracking sheet.
export const CREATIVE_STATUSES: CreativeStatus[] = [
  "BACKLOG",
  "SCRIPTING",
  "EDITING",
  "NEEDS_REVIEW",
  "NEEDS_REVISION",
  "READY",
];

export const STATUS_LABELS: Record<CreativeStatus, string> = {
  BACKLOG: "Backlog",
  SCRIPTING: "Scripting",
  EDITING: "Editing",
  NEEDS_REVIEW: "Needs Review",
  NEEDS_REVISION: "Needs Revision",
  READY: "Ready",
};

export const CREATIVE_PRIORITIES: CreativePriority[] = ["NORMAL", "IMPORTANT", "URGENT"];

export const PRIORITY_LABELS: Record<CreativePriority, string> = {
  NORMAL: "Normal",
  IMPORTANT: "Important",
  URGENT: "Urgent",
};

/**
 * AI models seen in the tracker. Includes tools outside this app (Google Omni,
 * Pixverse) because the tracker covers all creative, not just what's generated
 * here. Free-form on the API, so anything new can be typed in.
 */
export const AI_MODELS = [
  "Kling 3.0",
  "Google Omni",
  "Pixverse",
  "Nano Banana 2",
  "GPT Image 2",
  "Seedance 2.0",
] as const;

/** Brands/pages the team runs creative for. */
export const CREATIVE_PAGES = [
  "HealthyBlood",
  "BeyondThePill",
  "Wellness Journal",
  "Blood Pressure",
] as const;

/** "2026-07" → "July 2026" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Launch dates are calendar dates, not instants — always format them in UTC so
 * a viewer west of Greenwich doesn't see the previous day.
 */
export function formatTrackerDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { timeZone: "UTC" });
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Fields an assigned editor may change on their own rows. */
export const EDITOR_EDITABLE_FIELDS = ["status", "videoLink", "generations", "notes"] as const;
