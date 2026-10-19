import { z } from "zod";

// Omni Zone — the team's take on Google's Omni studio (Create / Animate / Edit /
// Extend clips, named avatars for character consistency, timeline stitching).
// Client-safe: shared by the workspace UI and the API routes.
//
// The Omni Flash API is NOT connected yet: generation requests are validated and
// saved as queued OMNI_FLASH jobs (admins see them in the Library) but nothing
// is sent to any provider.

export const OMNI_ENDPOINT = "not-connected/omni-flash";

export const OMNI_MODES = ["create", "animate", "edit", "extend"] as const;
export type OmniMode = (typeof OMNI_MODES)[number];

export const OMNI_MODE_INFO: Record<OmniMode, { label: string; help: string }> = {
  create: {
    label: "Create",
    help: "Generate a clip from a prompt. Add avatars and up to 7 ingredient images.",
  },
  animate: {
    label: "Animate",
    help: "Bring a photo to life — describe the motion, not the scene.",
  },
  edit: {
    label: "Edit",
    help: "Change an uploaded video in plain language (last 10s are used). Up to 3 reference images.",
  },
  extend: {
    label: "Extend",
    help: "Continue a clip from this project — describe only what happens next.",
  },
};

export const OMNI_ASPECT_RATIOS = ["9:16", "16:9"] as const;
export const OMNI_DURATIONS = ["3", "4", "5", "6", "7", "8", "9", "10"] as const;
export const OMNI_RESOLUTIONS = ["720p", "1080p"] as const;
export const MAX_INGREDIENTS = { create: 7, edit: 3 } as const;
export const MAX_AVATARS = 3;
export const MAX_CLIPS_PER_PROJECT = 40;

const url = z.url();

export const omniGenerateSchema = z
  .object({
    mode: z.enum(OMNI_MODES).default("create"),
    prompt: z.string().trim().min(1, "Prompt is required").max(5000),
    aspect_ratio: z.enum(OMNI_ASPECT_RATIOS).default("9:16"),
    duration: z.enum(OMNI_DURATIONS).default("8"),
    resolution: z.enum(OMNI_RESOLUTIONS).default("720p"),
    avatar_ids: z.array(z.string().min(1)).max(MAX_AVATARS).default([]),
    image_urls: z.array(url).max(MAX_INGREDIENTS.create).default([]),
    /** Animate: the photo to bring to life. */
    image_url: url.optional(),
    /** Edit: the uploaded video to change. */
    video_url: url.optional(),
    /** Extend: the timeline clip to continue. */
    source_clip_id: z.string().min(1).optional(),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (p.mode === "animate" && !p.image_url) issue("Animate needs a photo");
    if (p.mode === "edit" && !p.video_url) issue("Edit needs a video");
    if (p.mode === "extend" && !p.source_clip_id) issue("Pick the clip to extend");
    if (p.mode === "edit" && p.image_urls.length > MAX_INGREDIENTS.edit) {
      issue(`Edit takes at most ${MAX_INGREDIENTS.edit} reference images`);
    }
  });

export type OmniGenerateInput = z.infer<typeof omniGenerateSchema>;

export const avatarFieldsSchema = z.object({
  name: z.string().trim().min(2, "Give the avatar a name").max(60),
  description: z.string().trim().max(500).optional(),
  shared: z.boolean(),
});

export const AVATAR_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function avatarImageUrl(id: string): string {
  return `/api/avatars/${id}/image`;
}

/**
 * Clip sources the server is willing to fetch (stitching + downloads): fal's
 * CDN, where uploads and generations live, or our own R2 media route. Anything
 * else is rejected so a clip URL can't make the server fetch arbitrary hosts.
 */
export function isAllowedClipUrl(raw: string): boolean {
  if (raw.startsWith("/api/media/outputs/") && !raw.includes("..")) return true;
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" && (u.hostname === "fal.media" || u.hostname.endsWith(".fal.media"))
    );
  } catch {
    return false;
  }
}

/** Export canvas per project aspect ratio (720p keeps renders quick). */
export function exportCanvas(aspectRatio: string): { width: number; height: number } {
  return aspectRatio === "16:9" ? { width: 1280, height: 720 } : { width: 720, height: 1280 };
}

/** Safe download filename from a user-chosen name. */
export function fileSlug(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9 _-]+/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60) || "omni-project"
  );
}
