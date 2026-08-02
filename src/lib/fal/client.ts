import "server-only";
import { fal } from "@fal-ai/client";

// FAL_KEY must never reach the browser; this module is server-only and the
// import above makes bundling it into client code a build error.
fal.config({ credentials: process.env.FAL_KEY });

export { fal };

/** Webhook target for queue submissions, or undefined when unreachable. */
export function falWebhookUrl(): string | undefined {
  const base = process.env.APP_BASE_URL;
  // fal can't call back to localhost — local dev relies on the polling fallback.
  if (!base || /localhost|127\.0\.0\.1/.test(base)) return undefined;
  return `${base.replace(/\/$/, "")}/api/fal/webhook`;
}
