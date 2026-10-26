/**
 * Background rewards sync: reads the creative sheet every 10 minutes so an
 * approval is dated close to when it actually turned Ready (that date decides
 * which week/month it counts toward). Admins can also sync on demand.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.REWARDS_SYNC === "off") return;
  const { syncRewards } = await import("@/lib/rewards");
  const tick = () =>
    syncRewards().catch((error) => console.error("[rewards] sync failed:", error instanceof Error ? error.message : error));
  setTimeout(tick, 30_000);
  setInterval(tick, 10 * 60_000).unref();
}
