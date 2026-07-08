// Storage decision (Rahul, 2026-07-08): no R2 — generated media stays on fal's
// CDN, which retains files ~7 days. Editors download what they want to keep.
// If R2 creds are ever configured, outputs get persisted and served via
// /api/media/ instead, and none of this expiry logic applies to them.
export const FAL_MEDIA_RETENTION_DAYS = 7;

export function isMediaExpired(
  completedAt: string | Date | null | undefined,
  url: string
): boolean {
  if (url.startsWith("/api/media/")) return false; // persisted in our own bucket
  if (!completedAt) return false;
  const completed =
    typeof completedAt === "string" ? new Date(completedAt).getTime() : completedAt.getTime();
  return Date.now() - completed > FAL_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}
