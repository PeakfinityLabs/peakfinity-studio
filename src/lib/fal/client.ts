import "server-only";
import { fal as realFal } from "@fal-ai/client";
import { getSecret } from "@/lib/secrets";

// FAL_KEY must never reach the browser; this module is server-only and the
// import above makes bundling it into client code a build error.
//
// Credentials resolve at call time (DB-override → env) so an admin can rotate
// the fal key from the dashboard without a redeploy. There's a single global
// fal key, so reconfiguring the shared client per call is race-free.
let appliedKey: string | undefined;
if (process.env.FAL_KEY) {
  realFal.config({ credentials: process.env.FAL_KEY });
  appliedKey = process.env.FAL_KEY;
}

async function ensureCredentials(): Promise<void> {
  const key = await getSecret("FAL_KEY");
  if (key && key !== appliedKey) {
    realFal.config({ credentials: key });
    appliedKey = key;
  }
}

// Thin wrapper preserving the exact SDK surface the app uses, but ensuring
// current credentials before each call — so call sites stay unchanged.
export const fal = {
  subscribe: (async (...args: Parameters<typeof realFal.subscribe>) => {
    await ensureCredentials();
    return realFal.subscribe(...args);
  }) as typeof realFal.subscribe,
  storage: {
    upload: (async (...args: Parameters<typeof realFal.storage.upload>) => {
      await ensureCredentials();
      return realFal.storage.upload(...args);
    }) as typeof realFal.storage.upload,
  },
  queue: {
    submit: (async (...args: Parameters<typeof realFal.queue.submit>) => {
      await ensureCredentials();
      return realFal.queue.submit(...args);
    }) as typeof realFal.queue.submit,
    status: (async (...args: Parameters<typeof realFal.queue.status>) => {
      await ensureCredentials();
      return realFal.queue.status(...args);
    }) as typeof realFal.queue.status,
    result: (async (...args: Parameters<typeof realFal.queue.result>) => {
      await ensureCredentials();
      return realFal.queue.result(...args);
    }) as typeof realFal.queue.result,
    cancel: (async (...args: Parameters<typeof realFal.queue.cancel>) => {
      await ensureCredentials();
      return realFal.queue.cancel(...args);
    }) as typeof realFal.queue.cancel,
  },
};

/** Webhook target for queue submissions, or undefined when unreachable. */
export function falWebhookUrl(): string | undefined {
  const base = process.env.APP_BASE_URL;
  // fal can't call back to localhost — local dev relies on the polling fallback.
  if (!base || /localhost|127\.0\.0\.1/.test(base)) return undefined;
  return `${base.replace(/\/$/, "")}/api/fal/webhook`;
}
