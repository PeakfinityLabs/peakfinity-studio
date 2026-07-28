/**
 * Assignable job titles. Purely descriptive — they never affect permissions
 * (that's `role`: EDITOR vs ADMIN). Add or rename freely; the column is a
 * plain string, so no migration is needed.
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
