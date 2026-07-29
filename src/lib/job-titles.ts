/**
 * Assignable job titles. App access (Studio, Library, Usage, Admin) is governed
 * by `role` (EDITOR vs ADMIN), never by these.
 *
 * ONE EXCEPTION: in the creative tracker, "Strategist" grants visibility of the
 * whole board and permission to edit every field — see trackerCaps() in
 * lib/creatives.ts. Keep that in mind when assigning it or adding new titles.
 *
 * Add or rename freely otherwise; the column is a plain string, no migration.
 */
export const JOB_TITLES = [
  "Editor",
  "Strategist",
  "Creative Director",
  "Media Buyer",
  "Producer",
  "Copywriter",
  "Designer",
] as const;

export type JobTitle = (typeof JOB_TITLES)[number];

/** Sentinel used by the admin dropdown to clear a title (Select needs a value). */
export const NO_JOB_TITLE = "__none__";

export function isJobTitle(value: string): value is JobTitle {
  return (JOB_TITLES as readonly string[]).includes(value);
}
