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

async function call<T>(model: OmnirouterModel, path: string, init?: RequestInit): Promise<T> {
  const { secret, label } = OMNIROUTER_MODELS[model];
  const key = await getSecret(secret);
  if (!key) throw new Error(`${label} API key isn't set — add it in Admin → API keys.`);
  const res = await fetch(`${BASE_URL}${path}`, {
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

export function submitJob(model: OmnirouterModel, input: OmnirouterInput) {
  return call<OmnirouterJob>(model, "/jobs", {
    method: "POST",
    body: JSON.stringify({ model, input }),
  });
}

export function getJob(model: OmnirouterModel, id: string) {
  return call<OmnirouterJob>(model, `/jobs/${encodeURIComponent(id)}`);
}

export function cancelJob(model: OmnirouterModel, id: string) {
  return call<unknown>(model, `/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
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
