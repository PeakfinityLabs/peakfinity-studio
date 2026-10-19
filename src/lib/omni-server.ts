import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { prisma } from "@/lib/db";
import { getFromR2, r2Configured } from "@/lib/r2";
import type { SessionUser } from "@/lib/authz";
import { exportCanvas, isAllowedClipUrl } from "@/lib/omni";

const run = promisify(execFile);

/**
 * Omni projects are private to their owner — no exception for admins. Every
 * project route goes through this; a project you don't own is a 404.
 */
export function findOwnProject(me: Pick<SessionUser, "id">, id: string) {
  return prisma.omniProject.findFirst({ where: { id, userId: me.id } });
}

/** Avatars `me` may see/use: everything shared, plus their own private ones. */
export function visibleAvatarsWhere(me: Pick<SessionUser, "id">) {
  return { OR: [{ shared: true }, { createdById: me.id }] };
}

/** Fetches a clip's bytes (fal CDN or our R2 media). Throws on anything else. */
export async function fetchClipBytes(
  url: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!isAllowedClipUrl(url)) throw new Error("Clip source not allowed");
  if (url.startsWith("/api/media/")) {
    if (!r2Configured()) throw new Error("Object storage is not configured");
    const object = await getFromR2(url.slice("/api/media/".length));
    if (!object.Body) throw new Error("Clip not found in storage");
    return {
      bytes: await object.Body.transformToByteArray(),
      contentType: object.ContentType ?? "video/mp4",
    };
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      res.status === 404 || res.status === 403
        ? "A clip's media has expired — remove it or re-add it"
        : `Could not download a clip (${res.status})`
    );
  }
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "video/mp4",
  };
}

/** ffmpeg prints stream info to stderr and exits 1 when given no output. */
async function probe(file: string): Promise<{ hasAudio: boolean; seconds: number }> {
  const stderr: string = await run(ffmpegPath!, ["-hide_banner", "-i", file]).then(
    (r) => r.stderr,
    (e: { stderr?: string }) => e.stderr ?? ""
  );
  if (!/Stream #\d+:\d+.*: Video:/.test(stderr)) throw new Error("A clip isn't a playable video");
  const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return {
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(stderr),
    seconds: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
  };
}

/** The filter graph for stitching: every clip letterboxed onto one canvas, silent clips padded with silence. */
export function buildConcatArgs(
  clips: Array<{ file: string; hasAudio: boolean; seconds: number }>,
  canvas: { width: number; height: number },
  outFile: string
): string[] {
  const { width: w, height: h } = canvas;
  const inputs: string[] = [];
  const filters: string[] = [];
  const pairs: string[] = [];
  let next = 0;
  for (const [i, clip] of clips.entries()) {
    inputs.push("-i", clip.file);
    const v = next++;
    filters.push(
      `[${v}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`
    );
    if (clip.hasAudio) {
      filters.push(`[${v}:a]aresample=44100,aformat=channel_layouts=stereo[a${i}]`);
    } else {
      // concat needs an audio stream per segment — synthesize matching silence.
      inputs.push(
        "-f",
        "lavfi",
        "-t",
        String(Math.max(clip.seconds, 0.1)),
        "-i",
        "anullsrc=r=44100:cl=stereo"
      );
      filters.push(`[${next++}:a]anull[a${i}]`);
    }
    pairs.push(`[v${i}][a${i}]`);
  }
  filters.push(`${pairs.join("")}concat=n=${clips.length}:v=1:a=1[v][a]`);
  return [
    "-hide_banner",
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    outFile,
  ];
}

/**
 * Stitches clips (in order) into one MP4 on the project canvas. Returns the
 * path of the result plus a cleanup callback the caller MUST run.
 */
export async function stitchClips(
  urls: string[],
  aspectRatio: string
): Promise<{ file: string; cleanup: () => Promise<void> }> {
  if (!ffmpegPath) throw new Error("ffmpeg is not available on this server");
  const dir = await mkdtemp(path.join(tmpdir(), "omni-"));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    const clips = [];
    for (const [i, url] of urls.entries()) {
      const file = path.join(dir, `in-${i}`);
      await writeFile(file, (await fetchClipBytes(url)).bytes);
      clips.push({ file, ...(await probe(file)) });
    }
    const out = path.join(dir, "out.mp4");
    await run(ffmpegPath, buildConcatArgs(clips, exportCanvas(aspectRatio), out), {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10 * 60_000,
    });
    return { file: out, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
