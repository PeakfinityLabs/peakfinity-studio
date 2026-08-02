import { z } from "zod";
import type { GenModel, JobType } from "@/generated/prisma/enums";

// ─── Shared field/form descriptors (drive the studio forms) ─────────────────

export type SelectField = {
  kind: "select";
  name: string;
  label: string;
  options: readonly string[];
  /** Friendlier display text per option value; the value sent to fal is unchanged. */
  optionLabels?: Record<string, string>;
  help?: string;
};

// Orientation hints for the common ad ratios — value stays the raw ratio.
export const ASPECT_RATIO_LABELS: Record<string, string> = {
  "16:9": "16:9 (Landscape)",
  "9:16": "9:16 (Portrait)",
};
export type NumberField = {
  kind: "number";
  name: string;
  label: string;
  min: number;
  max: number;
  help?: string;
};
export type SwitchField = { kind: "switch"; name: string; label: string; help?: string };
export type TextField = { kind: "text"; name: string; label: string; help?: string };
export type FormField = SelectField | NumberField | SwitchField | TextField;

export type UploaderDef = {
  /** Param name that receives the URL(s). Single uploaders get a string, multi get string[]. */
  name: string;
  label: string;
  accept: string;
  max: number;
  single?: boolean;
  required?: boolean;
  help?: string;
};

export type ModelParams = Record<string, unknown>;

export type ModelDef = {
  slug: ModelSlug;
  genModel: GenModel;
  label: string;
  tagline: string;
  type: JobType;
  /** True when the model accepts a prompt (Kling's is optional but present). */
  promptRequired: boolean;
  promptPlaceholder: string;
  schema: z.ZodType<ModelParams>;
  fields: FormField[];
  uploaders: UploaderDef[];
  defaults: ModelParams;
  resolveEndpoint: (params: ModelParams) => string;
  /** Params exactly as fal expects them (empty optional arrays stripped). */
  toFalInput: (params: ModelParams) => Record<string, unknown>;
  estimateCostCents: (params: ModelParams) => number;
  costNote: string;
};

export type ModelSlug = "nano-banana-2" | "gpt-image-2" | "kling-o3" | "seedance-2";

const url = z.url();
const urlArray = z.array(url);

function stripEmpty(params: ModelParams): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
}

// ─── Nano Banana 2 (Google) — image generate + edit ─────────────────────────

const NB2_ASPECT_RATIOS = [
  "auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1",
  "4:5", "3:4", "2:3", "9:16", "4:1", "1:4", "8:1", "1:8",
] as const;

const nanoBanana2Schema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(5000),
  image_urls: urlArray.max(14).default([]),
  num_images: z.coerce.number().int().min(1).max(4).default(1),
  aspect_ratio: z.enum(NB2_ASPECT_RATIOS).default("auto"),
  resolution: z.enum(["0.5K", "1K", "2K", "4K"]).default("1K"),
  output_format: z.enum(["jpeg", "png", "webp"]).default("png"),
  seed: z.coerce.number().int().optional(),
  system_prompt: z.string().trim().max(5000).optional(),
  thinking_level: z.enum(["minimal", "high"]).optional(),
  enable_web_search: z.boolean().optional(),
  safety_tolerance: z.coerce.number().int().min(1).max(6).default(4),
});

// PRICING ESTIMATES — cents per image by resolution. fal doesn't publish these
// on the model page; tune here as invoices come in. (Usage dashboard reads
// UsageEvent.costCents, so historic rows keep the rate at generation time.)
const NB2_CENTS_PER_IMAGE: Record<string, number> = { "0.5K": 3, "1K": 4, "2K": 7, "4K": 13 };

const nanoBanana2: ModelDef = {
  slug: "nano-banana-2",
  genModel: "NANO_BANANA_2",
  label: "Nano Banana 2",
  tagline: "Google image generation + natural-language editing (up to 14 reference images)",
  type: "IMAGE",
  promptRequired: true,
  promptPlaceholder:
    "Describe the image, or the edit to apply to the reference images (e.g. \"replace the background with a beach sunset\")…",
  schema: nanoBanana2Schema,
  fields: [
    { kind: "select", name: "aspect_ratio", label: "Aspect ratio", options: NB2_ASPECT_RATIOS, optionLabels: ASPECT_RATIO_LABELS },
    { kind: "select", name: "resolution", label: "Resolution", options: ["0.5K", "1K", "2K", "4K"], help: "Team default is 1K" },
    { kind: "number", name: "num_images", label: "Images", min: 1, max: 4 },
    { kind: "select", name: "output_format", label: "Format", options: ["jpeg", "png", "webp"] },
    { kind: "select", name: "thinking_level", label: "Thinking", options: ["minimal", "high"], help: "Higher = better prompt adherence, slower" },
    { kind: "number", name: "safety_tolerance", label: "Safety tolerance", min: 1, max: 6, help: "1 strict — 6 loose" },
    { kind: "switch", name: "enable_web_search", label: "Web search", help: "Let the model look up real-world references" },
    { kind: "number", name: "seed", label: "Seed", min: 0, max: 2147483647, help: "Optional — for reproducibility" },
  ],
  uploaders: [
    {
      name: "image_urls",
      label: "Reference images (optional — presence switches to edit mode)",
      accept: "image/*",
      max: 14,
    },
  ],
  defaults: {
    num_images: 1,
    aspect_ratio: "auto",
    resolution: "1K",
    output_format: "png",
    safety_tolerance: 4,
  },
  resolveEndpoint: (params) =>
    Array.isArray(params.image_urls) && params.image_urls.length > 0
      ? "fal-ai/nano-banana-2/edit"
      : "fal-ai/nano-banana-2",
  toFalInput: stripEmpty,
  estimateCostCents: (params) => {
    const perImage = NB2_CENTS_PER_IMAGE[String(params.resolution ?? "1K")] ?? 4;
    return perImage * Number(params.num_images ?? 1);
  },
  costNote: "≈4¢ per 1K image",
};

// ─── GPT Image 2 (OpenAI, fal-managed — no OpenAI key) ──────────────────────

const GPT_IMAGE_SIZES = [
  "auto", "square_hd", "square", "portrait_4_3", "portrait_16_9",
  "landscape_4_3", "landscape_16_9",
] as const;

const gptImage2Schema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(10000),
  image_urls: urlArray.max(10).default([]),
  image_size: z.enum(GPT_IMAGE_SIZES).default("auto"),
  quality: z.enum(["auto", "low", "medium", "high"]).default("high"),
  num_images: z.coerce.number().int().min(1).max(4).default(1),
  output_format: z.enum(["jpeg", "png", "webp"]).default("png"),
  mask_url: url.optional(),
});

// PRICING ESTIMATES — cents per image by quality (tune with real invoices).
const GPT2_CENTS_PER_IMAGE: Record<string, number> = { low: 2, medium: 7, high: 20, auto: 20 };

const gptImage2: ModelDef = {
  slug: "gpt-image-2",
  genModel: "GPT_IMAGE_2",
  label: "GPT Image 2",
  tagline: "OpenAI image generation + masked editing, strong text rendering",
  type: "IMAGE",
  promptRequired: true,
  promptPlaceholder:
    "Describe the image, or the edit to apply to the reference images. Add a mask to constrain the edited region…",
  schema: gptImage2Schema,
  fields: [
    { kind: "select", name: "image_size", label: "Size", options: GPT_IMAGE_SIZES },
    { kind: "select", name: "quality", label: "Quality", options: ["auto", "low", "medium", "high"] },
    { kind: "number", name: "num_images", label: "Images", min: 1, max: 4 },
    { kind: "select", name: "output_format", label: "Format", options: ["jpeg", "png", "webp"] },
  ],
  uploaders: [
    {
      name: "image_urls",
      label: "Reference images (optional — presence switches to edit mode)",
      accept: "image/*",
      max: 10,
    },
    {
      name: "mask_url",
      label: "Mask (optional — white areas get edited)",
      accept: "image/*",
      max: 1,
      single: true,
    },
  ],
  defaults: { image_size: "auto", quality: "high", num_images: 1, output_format: "png" },
  resolveEndpoint: (params) =>
    Array.isArray(params.image_urls) && params.image_urls.length > 0
      ? "openai/gpt-image-2/edit"
      : "openai/gpt-image-2",
  toFalInput: stripEmpty,
  estimateCostCents: (params) => {
    const perImage = GPT2_CENTS_PER_IMAGE[String(params.quality ?? "high")] ?? 20;
    return perImage * Number(params.num_images ?? 1);
  },
  costNote: "≈20¢ per high-quality image",
};

// ─── Kling O3 [Pro] — image-to-video ─────────────────────────────────────────
// fal titles the o3/standard page "[Pro]"; /standard/ is the correct path.
// Do NOT change to /o3/pro/ — that is a separate, slower, pricier tier.

const KLING_DURATIONS = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;

const klingO3Schema = z.object({
  image_url: url,
  end_image_url: url.optional(),
  prompt: z.string().trim().max(2500).optional(),
  duration: z.enum(KLING_DURATIONS).default("5"),
  generate_audio: z.boolean().default(false),
});

const KLING_CENTS_PER_SECOND = { audioOff: 8.4, audioOn: 11.2 };

const klingO3: ModelDef = {
  slug: "kling-o3",
  genModel: "KLING_O3",
  label: "Kling O3 [Pro]",
  tagline: "Animate a start frame (optionally toward an end frame) with text-driven motion",
  type: "VIDEO",
  promptRequired: false,
  promptPlaceholder: "Describe the motion, camera movement and mood (optional)…",
  schema: klingO3Schema,
  fields: [
    { kind: "select", name: "duration", label: "Duration (s)", options: KLING_DURATIONS },
    { kind: "switch", name: "generate_audio", label: "Generate audio", help: "+33% cost" },
  ],
  uploaders: [
    { name: "image_url", label: "Start frame", accept: "image/*", max: 1, single: true, required: true },
    { name: "end_image_url", label: "End frame (optional)", accept: "image/*", max: 1, single: true },
  ],
  defaults: { duration: "5", generate_audio: false },
  resolveEndpoint: () => "fal-ai/kling-video/o3/standard/image-to-video",
  toFalInput: stripEmpty,
  estimateCostCents: (params) => {
    const seconds = Number(params.duration ?? 5);
    const rate = params.generate_audio
      ? KLING_CENTS_PER_SECOND.audioOn
      : KLING_CENTS_PER_SECOND.audioOff;
    return Math.round(seconds * rate);
  },
  costNote: "$0.084/s (audio off) · $0.112/s (audio on)",
};

// ─── Seedance 2.0 (ByteDance) — reference-to-video ──────────────────────────

const SEEDANCE_DURATIONS = ["auto", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const SEEDANCE_ASPECT_RATIOS = ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;

const seedance2Schema = z
  .object({
    prompt: z.string().trim().min(1, "Prompt is required").max(5000),
    image_urls: urlArray.max(9).default([]),
    video_urls: urlArray.max(3).default([]),
    audio_urls: urlArray.max(3).default([]),
    resolution: z.enum(["480p", "720p"]).default("720p"),
    duration: z.enum(SEEDANCE_DURATIONS).default("auto"),
    aspect_ratio: z.enum(SEEDANCE_ASPECT_RATIOS).default("auto"),
    generate_audio: z.boolean().default(true),
    seed: z.coerce.number().int().optional(),
  })
  .superRefine((params, ctx) => {
    const total = params.image_urls.length + params.video_urls.length + params.audio_urls.length;
    if (total > 12) {
      ctx.addIssue({ code: "custom", message: "At most 12 reference files in total" });
    }
    if (
      params.audio_urls.length > 0 &&
      params.image_urls.length === 0 &&
      params.video_urls.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Audio references require at least one image or video reference",
      });
    }
  });

// $0.3034/s at 720p (token-based, so an estimate); ×0.6 with video inputs;
// 480p scaled by pixel ratio (~0.44).
const SEEDANCE_CENTS_PER_SECOND_720P = 30.34;

const seedance2: ModelDef = {
  slug: "seedance-2",
  genModel: "SEEDANCE_2",
  label: "Seedance 2.0",
  tagline: "Cinematic video from up to 9 images + 3 videos + 3 audio clips, native audio",
  type: "VIDEO",
  promptRequired: true,
  promptPlaceholder:
    "Describe the video. Cite references as @Image1, @Video1, @Audio1 (e.g. \"@Image1 walks through @Image2's set while @Audio1 plays\")…",
  schema: seedance2Schema as z.ZodType<ModelParams>,
  fields: [
    { kind: "select", name: "resolution", label: "Resolution", options: ["480p", "720p"] },
    { kind: "select", name: "duration", label: "Duration (s)", options: SEEDANCE_DURATIONS },
    { kind: "select", name: "aspect_ratio", label: "Aspect ratio", options: SEEDANCE_ASPECT_RATIOS, optionLabels: ASPECT_RATIO_LABELS },
    { kind: "switch", name: "generate_audio", label: "Generate audio" },
    { kind: "number", name: "seed", label: "Seed", min: 0, max: 2147483647, help: "Optional — for reproducibility" },
  ],
  uploaders: [
    { name: "image_urls", label: "Image references (@Image1…)", accept: "image/*", max: 9 },
    { name: "video_urls", label: "Video references (@Video1…, 2–15s combined)", accept: "video/*", max: 3 },
    { name: "audio_urls", label: "Audio references (@Audio1…, ≤15s combined)", accept: "audio/*", max: 3 },
  ],
  defaults: { resolution: "720p", duration: "auto", aspect_ratio: "auto", generate_audio: true },
  resolveEndpoint: () => "bytedance/seedance-2.0/reference-to-video",
  toFalInput: stripEmpty,
  estimateCostCents: (params) => {
    const duration = params.duration === "auto" ? 5 : Number(params.duration ?? 5);
    const resolutionFactor = params.resolution === "480p" ? 0.44 : 1;
    const videoDiscount = Array.isArray(params.video_urls) && params.video_urls.length > 0 ? 0.6 : 1;
    return Math.round(duration * SEEDANCE_CENTS_PER_SECOND_720P * resolutionFactor * videoDiscount);
  },
  costNote: "≈$0.30/s at 720p · ×0.6 with video refs (token-based; estimate)",
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const MODELS: Record<ModelSlug, ModelDef> = {
  "nano-banana-2": nanoBanana2,
  "gpt-image-2": gptImage2,
  "kling-o3": klingO3,
  "seedance-2": seedance2,
};

export const MODEL_SLUGS = Object.keys(MODELS) as ModelSlug[];

export function isModelSlug(value: string): value is ModelSlug {
  return value in MODELS;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Kling lip-sync (change-voice) — not a studio model ──────────────────────
// Created from an existing generation via "Change voice", so it has no studio
// page and lives outside MODELS. Labels/costs still need to render everywhere.

export const KLING_LIPSYNC_LABEL = "Voice change (lip-sync)";

/** Display label for any GenModel, including non-studio ones. */
export function labelForGenModel(genModel: string): string {
  if (genModel === "KLING_LIPSYNC") return KLING_LIPSYNC_LABEL;
  const def = MODEL_SLUGS.map((s) => MODELS[s]).find((m) => m.genModel === genModel);
  return def?.label ?? genModel;
}

/** $0.014 per input-second, billed in 5s increments (fal Kling lipsync). */
export function lipsyncCostCents(videoSeconds: number): number {
  const billedSeconds = Math.max(5, Math.ceil(videoSeconds / 5) * 5);
  return Math.round(billedSeconds * 1.4);
}
