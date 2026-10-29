/**
 * Server 2 = the same models on fal.ai (the studio's existing FAL_KEY), used
 * when Server 1 (omnirouter / api.webinhour.com) errors:
 *   Veo 3.1 Lite   → fal-ai/veo3.1/lite[/image-to-video | /first-last-frame-to-video]
 *   Omni Flash 1.1 → google/gemini-omni-flash/v1.1/<text|reference|image>-to-video | edit | extend
 * Jobs are saved with the fal endpoint, so the normal fal webhook, polling and
 * cancel paths settle them. Prices are fal's published 720p rates.
 */

export const FAL_VEO_CENTS_PER_SECOND = 5; // 720p with audio
export const FAL_OMNI_CENTS_PER_SECOND = 10; // 720p

const VEO = "fal-ai/veo3.1/lite";
const OMNI = "google/gemini-omni-flash/v1.1";

export function isServer2(params: Record<string, unknown>): boolean {
  return params.server === "2";
}

/** Veo 3.1 Lite on fal. Clips are always 8s, 720p, with audio (same as Server 1). */
export function falVeo(p: Record<string, unknown>): { endpoint: string; input: Record<string, unknown> } {
  const base = {
    prompt: String(p.prompt),
    aspect_ratio: p.aspect_ratio === "16:9" ? "16:9" : "9:16",
    duration: "8s",
    resolution: "720p",
    generate_audio: true,
  };
  const start = typeof p.image_url === "string" ? p.image_url : null;
  const end = typeof p.end_image_url === "string" ? p.end_image_url : null;
  if (start && end) {
    return {
      endpoint: `${VEO}/first-last-frame-to-video`,
      input: { ...base, first_frame_url: start, last_frame_url: end },
    };
  }
  if (start) return { endpoint: `${VEO}/image-to-video`, input: { ...base, image_url: start } };
  return { endpoint: VEO, input: base };
}

export type OmniFalRequest =
  | { mode: "create"; prompt: string; aspect: string; seconds: number; images: string[] }
  | { mode: "animate"; prompt: string; aspect: string; seconds: number; image: string }
  | { mode: "edit"; prompt: string; video: string }
  | { mode: "extend"; prompt: string; video: string; seconds: number };

/** Omni Flash 1.1 on fal — one endpoint per Omni mode. */
export function falOmni(r: OmniFalRequest): { endpoint: string; input: Record<string, unknown> } {
  const resolution = "720p";
  switch (r.mode) {
    case "create": {
      const input = { prompt: r.prompt, aspect_ratio: r.aspect, duration: r.seconds, resolution };
      return r.images.length
        ? { endpoint: `${OMNI}/reference-to-video`, input: { ...input, image_urls: r.images } }
        : { endpoint: `${OMNI}/text-to-video`, input };
    }
    case "animate":
      return {
        endpoint: `${OMNI}/image-to-video`,
        input: { prompt: r.prompt, aspect_ratio: r.aspect, duration: r.seconds, resolution, image_url: r.image },
      };
    case "edit":
      return { endpoint: `${OMNI}/edit`, input: { prompt: r.prompt, video_url: r.video, resolution } };
    case "extend":
      return {
        endpoint: `${OMNI}/extend`,
        input: { prompt: r.prompt, video_url: r.video, duration: r.seconds, resolution },
      };
  }
}
