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

/**
 * Keeps only avatar ids `me` may use (shared, or their own), deduped, in order.
 * Used to validate a project's saved avatars on write and to drop ones that
 * were deleted or made private on read.
 */
export async function usableAvatarIds(
  me: Pick<SessionUser, "id">,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const ok = await prisma.avatar.findMany({
    where: { id: { in: ids }, ...visibleAvatarsWhere(me) },
    select: { id: true },
  });
  const allowed = new Set(ok.map((a) => a.id));
  return [...new Set(ids)].filter((id) => allowed.has(id));
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

/**
 * Duration/audio of a clip: a local file path ({local:true}) or an allowed
 * clip URL (downloaded to a temp file first).
 */
export async function probeClip(
  source: string,
  opts: { local?: boolean } = {}
): Promise<{ hasAudio: boolean; seconds: number }> {
  if (opts.local) return probe(source);
  const dir = await mkdtemp(path.join(tmpdir(), "omni-probe-"));
  try {
    const file = path.join(dir, "in");
    await writeFile(file, (await fetchClipBytes(source)).bytes);
    return await probe(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

export type Segment = { url: string; trimStart: number; trimEnd: number | null };

/** Clamp a trim to the source length; returns the [start, end) actually played. */
export function resolveTrim(seg: { trimStart: number; trimEnd: number | null }, seconds: number) {
  const start = Math.min(Math.max(seg.trimStart, 0), Math.max(seconds - 0.1, 0));
  const end =
    seg.trimEnd === null ? seconds : Math.min(Math.max(seg.trimEnd, start + 0.1), seconds);
  return { start, end };
}

/**
 * The filter graph for stitching: each segment trimmed to its in/out points,
 * letterboxed onto one canvas; silent sources padded with matching silence.
 */
export function buildConcatArgs(
  segments: Array<{ input: number; hasAudio: boolean; start: number; end: number }>,
  sourceFiles: string[],
  canvas: { width: number; height: number },
  outFile: string
): string[] {
  const { width: w, height: h } = canvas;
  const inputs: string[] = sourceFiles.flatMap((f) => ["-i", f]);
  const filters: string[] = [];
  const pairs: string[] = [];
  let next = sourceFiles.length;
  // A source used by several segments (a cut clip) must be split explicitly —
  // ffmpeg can't feed one input pad to two filter chains.
  const uses = new Map<number, number>();
  for (const seg of segments) uses.set(seg.input, (uses.get(seg.input) ?? 0) + 1);
  const taken = new Map<number, number>();
  for (const [input, n] of uses) {
    if (n < 2) continue;
    const hasAudio = segments.find((s) => s.input === input)!.hasAudio;
    filters.push(
      `[${input}:v]fps=30,split=${n}${Array.from({ length: n }, (_, k) => `[sv${input}_${k}]`).join("")}`
    );
    if (hasAudio) {
      filters.push(
        `[${input}:a]asplit=${n}${Array.from({ length: n }, (_, k) => `[sa${input}_${k}]`).join("")}`
      );
    }
  }
  // fps runs before trim (on the source): placed after setpts it re-pads the
  // trimmed stream back out to the source's length.
  const pad = (input: number, kind: "v" | "a") => {
    if ((uses.get(input) ?? 0) < 2) return kind === "v" ? `[${input}:v]fps=30,` : `[${input}:a]`;
    const k = taken.get(input) ?? 0;
    if (kind === "a") taken.set(input, k + 1);
    return `[s${kind}${input}_${k}]`;
  };
  for (const [i, seg] of segments.entries()) {
    const t = `start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)}`;
    const vPad = pad(seg.input, "v");
    filters.push(
      `${vPad}trim=${t},setpts=PTS-STARTPTS,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}]`
    );
    if (seg.hasAudio) {
      filters.push(
        `${pad(seg.input, "a")}atrim=${t},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo[a${i}]`
      );
    } else {
      // concat needs an audio stream per segment — synthesize matching silence.
      taken.set(seg.input, (taken.get(seg.input) ?? 0) + 1);
      inputs.push(
        "-f",
        "lavfi",
        "-t",
        (seg.end - seg.start).toFixed(3),
        "-i",
        "anullsrc=r=44100:cl=stereo"
      );
      filters.push(`[${next++}:a]anull[a${i}]`);
    }
    pairs.push(`[v${i}][a${i}]`);
  }
  filters.push(`${pairs.join("")}concat=n=${segments.length}:v=1:a=1[v][a]`);
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
 * Renders segments (in order, trims applied) into one MP4 on the project
 * canvas. Each distinct source is downloaded once even if cuts reuse it.
 * Returns the result path plus a cleanup callback the caller MUST run.
 */
export async function stitchClips(
  segments: Segment[],
  aspectRatio: string
): Promise<{ file: string; cleanup: () => Promise<void> }> {
  if (!ffmpegPath) throw new Error("ffmpeg is not available on this server");
  const dir = await mkdtemp(path.join(tmpdir(), "omni-"));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    const sources = [...new Set(segments.map((s) => s.url))];
    const files: string[] = [];
    const info: Array<{ hasAudio: boolean; seconds: number }> = [];
    for (const [i, url] of sources.entries()) {
      const file = path.join(dir, `in-${i}`);
      await writeFile(file, (await fetchClipBytes(url)).bytes);
      files.push(file);
      info.push(await probe(file));
    }
    const resolved = segments.map((seg) => {
      const input = sources.indexOf(seg.url);
      return { input, hasAudio: info[input].hasAudio, ...resolveTrim(seg, info[input].seconds) };
    });
    const out = path.join(dir, "out.mp4");
    await run(ffmpegPath, buildConcatArgs(resolved, files, exportCanvas(aspectRatio), out), {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10 * 60_000,
    });
    return { file: out, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
