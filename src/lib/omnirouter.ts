import "server-only";
import { getSecret, type SecretName } from "@/lib/secrets";
import { toEnglish } from "@/lib/translate";

// Veo 3.1 Lite + Omni Flash 1.1, sold through omnirouter (api.webinhour.com).
// No public docs — the contract below was mapped from the API's own
// validation errors and one real job per model:
//   POST /v1/jobs {model, input:{prompt, aspect_ratio: landscape|portrait,
//     duration_sec, start_image_url?, end_image_url?, reference_image_urls?[≤10],
//     reference_video_url? (Omni only)}} → {id, status, cost, ...}
//   GET  /v1/jobs/:id → status queued|processing|succeeded|…, output.url (mp4)
// Resolution is fixed by the model id (720p on the plans purchased). No webhooks:
// open jobs are refreshed by polling (see refreshOmnirouterJob).

const BASE_URL = "https://api.webinhour.com/v1";

export const OMNIROUTER_PREFIX = "omnirouter/";

export const OMNIROUTER_MODELS = {
  "veo-3-1": { secret: "VEO_API_KEY" as SecretName, label: "Veo 3.1 Lite" },
  "omni-flash": { secret: "OMNI_FLASH_API_KEY" as SecretName, label: "Omni Flash 1.1" },
} as const;
export type OmnirouterModel = keyof typeof OMNIROUTER_MODELS;

/**
 * Server 1 = the main keys on api.webinhour.com. Server 2 = a backup with its
 * own keys (VEO_API_KEY_2 / OMNI_FLASH_API_KEY_2) and optionally its own API
 * address — same contract. Editors pick one per generation; the job remembers
 * it so polling and cancel go to the same server.
 */
export const SERVERS = ["1", "2"] as const;
export type Server = (typeof SERVERS)[number];
export const SERVER_LABELS: Record<string, string> = { "1": "Server 1", "2": "Server 2" };

/** The server a saved job was sent to (older jobs: Server 1). */
export function serverOf(params: Record<string, unknown>): Server {
  return params.server === "2" ? "2" : "1";
}

async function serverConfig(model: OmnirouterModel, server: Server) {
  const { secret, label } = OMNIROUTER_MODELS[model];
  if (server === "1") return { key: await getSecret(secret), base: BASE_URL, label };
  const custom = (await getSecret("OMNIROUTER_BASE_URL_2"))?.trim().replace(/\/+$/, "");
  // Only https, so a typo'd address can't send keys in the clear.
  const base = custom && /^https:\/\/[^\s]+$/.test(custom) ? custom : BASE_URL;
  return { key: await getSecret(`${secret}_2` as SecretName), base, label: `${label} (Server 2)` };
}

export type OmnirouterInput = {
  prompt: string;
  aspect_ratio: "landscape" | "portrait";
  /** Not allowed with reference_video_url (the window sets the length). */
  duration_sec?: number;
  start_image_url?: string;
  end_image_url?: string;
  reference_image_urls?: string[];
  reference_video_url?: string;
  /** Window of reference_video_url to edit (≤10s). */
  trim_start_sec?: number;
  trim_end_sec?: number;
};

export type OmnirouterJob = {
  id: string;
  status: string;
  output: { url?: string; mime_type?: string; poster_url?: string; duration_sec?: number } | null;
  error: { message?: string } | string | null;
  cost: string | null;
  cost_is_final?: boolean;
};

export function toAspect(ratio: unknown): "landscape" | "portrait" {
  return ratio === "16:9" ? "landscape" : "portrait";
}

export function isOmnirouterEndpoint(endpoint: string): boolean {
  return endpoint.startsWith(OMNIROUTER_PREFIX);
}

export function modelFromEndpoint(endpoint: string): OmnirouterModel {
  const model = endpoint.slice(OMNIROUTER_PREFIX.length);
  if (!(model in OMNIROUTER_MODELS)) throw new Error(`Unknown omnirouter model: ${model}`);
  return model as OmnirouterModel;
}

async function call<T>(model: OmnirouterModel, server: Server, path: string, init?: RequestInit): Promise<T> {
  const { key, base, label } = await serverConfig(model, server);
  if (!key) {
    throw new Error(
      server === "2"
        ? `Server 2 isn't set up yet — an admin needs to add its key in Admin → API keys. Switch back to Server 1.`
        : `${label} API key isn't set — add it in Admin → API keys.`
    );
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // HTML error page (e.g. 404 from the proxy)
  }
  if (!res.ok) {
    const err = (data as { error?: { message?: string } } | null)?.error?.message;
    const e = new Error(err ? await toEnglish(err) : `${label} request failed (${res.status})`) as Error & {
      status?: number;
    };
    e.status = res.status;
    throw e;
  }
  return data as T;
}

export function submitJob(model: OmnirouterModel, input: OmnirouterInput, server: Server = "1") {
  return call<OmnirouterJob>(model, server, "/jobs", {
    method: "POST",
    body: JSON.stringify({ model, input }),
  });
}

export function getJob(model: OmnirouterModel, id: string, server: Server = "1") {
  return call<OmnirouterJob>(model, server, `/jobs/${encodeURIComponent(id)}`);
}

export function cancelJob(model: OmnirouterModel, id: string, server: Server = "1") {
  return call<unknown>(model, server, `/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

/** Provider status → our JobStatus (or "DONE"/"FAILED" terminal markers). */
export function mapStatus(status: string): "IN_QUEUE" | "IN_PROGRESS" | "DONE" | "FAILED" {
  switch (status) {
    case "queued":
    case "pending":
      return "IN_QUEUE";
    case "processing":
    case "running":
    case "in_progress":
      return "IN_PROGRESS";
    case "succeeded":
    case "completed":
      return "DONE";
    default:
      return "FAILED"; // failed, error, cancelled, expired, …
  }
}

/** The provider's failure reason, in English (it sometimes answers in Vietnamese). */
export async function errorText(job: OmnirouterJob): Promise<string> {
  const raw = typeof job.error === "string" ? job.error : job.error?.message;
  return raw ? toEnglish(raw) : `Generation ${job.status}`;
}

/** Dollars string ("0.03000000") → whole cents, at least 1 for any non-zero cost. */
export function costToCents(cost: string | null | undefined): number | null {
  const n = Number(cost);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? Math.max(1, Math.round(n * 100)) : 0;
}
