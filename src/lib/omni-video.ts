import "server-only";
import { readFile } from "node:fs/promises";
import { fal } from "@/lib/fal/client";
import { probeClip, stitchClips } from "@/lib/omni-server";

/**
 * Prepares a source clip for Omni Edit/Extend. The provider only fetches a
 * public https MP4 and edits a window of ≤maxSeconds, so we render exactly the
 * part to send — the clip's kept range, last ≤maxSeconds of it — to an MP4 on
 * the project canvas, host it on fal storage (same as change-voice does), and
 * pass the full rendered length as the window.
 */
export async function publicVideoWindow(
  clip: { url: string; trimStart: number; trimEnd: number | null },
  maxSeconds: number,
  aspectRatio: string
): Promise<{ url: string; trimStart: number; trimEnd: number }> {
  const { seconds } = await probeClip(clip.url);
  const end = clip.trimEnd === null ? seconds : Math.min(clip.trimEnd, seconds);
  const start = Math.max(clip.trimStart, end - maxSeconds);

  const { file, cleanup } = await stitchClips(
    [{ url: clip.url, trimStart: start, trimEnd: end }],
    aspectRatio
  );
  try {
    const bytes = await readFile(file);
    const rendered = await probeClip(file, { local: true });
    const url = await fal.storage.upload(new Blob([bytes], { type: "video/mp4" }));
    return { url, trimStart: 0, trimEnd: Math.min(maxSeconds, Math.max(rendered.seconds, 0.1)) };
  } finally {
    await cleanup();
  }
}
