// Self-check for Omni Zone stitching + clip URL allowlist. No network, no DB.
//   npx tsx --conditions=react-server scripts/check-omni.ts
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { isAllowedClipUrl } from "../src/lib/omni";
import { resolveTrim, stitchClips } from "../src/lib/omni-server";

const run = promisify(execFile);

async function main() {
  // Allowlist: fal CDN + our own media only.
  assert(isAllowedClipUrl("https://v3.fal.media/files/x/clip.mp4"));
  assert(isAllowedClipUrl("https://v3b.fal.media/files/b/clip.mp4"));
  assert(isAllowedClipUrl("/api/media/outputs/job/0.mp4"));
  assert(!isAllowedClipUrl("http://v3.fal.media/files/x.mp4"));
  assert(!isAllowedClipUrl("https://evil.com/fal.media/x.mp4"));
  assert(!isAllowedClipUrl("https://fal.media.evil.com/x.mp4"));
  assert(!isAllowedClipUrl("http://169.254.169.254/latest/meta-data"));
  assert(!isAllowedClipUrl("/api/media/outputs/../inputs/x"));

  // Trim clamping
  assert.deepEqual(resolveTrim({ trimStart: 0, trimEnd: null }, 5), { start: 0, end: 5 });
  assert.deepEqual(resolveTrim({ trimStart: 1, trimEnd: 9 }, 5), { start: 1, end: 5 });
  assert.deepEqual(resolveTrim({ trimStart: 7, trimEnd: null }, 5), { start: 4.9, end: 5 });

  // Two clips that differ in everything stitching has to normalise:
  // 16:9 with audio, then 9:16 with no audio track at all.
  const dir = await mkdtemp(path.join(tmpdir(), "omni-check-"));
  const a = path.join(dir, "a.mp4");
  const b = path.join(dir, "b.mp4");
  await run(ffmpegPath!, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=640x360:rate=25:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-shortest",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    a,
  ]);
  await run(ffmpegPath!, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=360x640:rate=30:duration=3",
    "-an",
    "-c:v",
    "libx264",
    b,
  ]);

  // Serve the local files as if they were on fal's CDN.
  const files: Record<string, string> = {
    "https://v3.fal.media/files/check/a.mp4": a,
    "https://v3.fal.media/files/check/b.mp4": b,
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const file = files[String(input)];
    return file ? new Response(await readFile(file)) : new Response("", { status: 404 });
  }) as typeof fetch;

  const full = (url: string) => ({ url, trimStart: 0, trimEnd: null });
  const [urlA, urlB] = Object.keys(files);
  const render = async (segs: Parameters<typeof stitchClips>[0]) => {
    const { file, cleanup } = await stitchClips(segs, "9:16");
    const out: string = await run(ffmpegPath!, ["-hide_banner", "-i", file]).then(
      (r) => r.stderr,
      (e: { stderr: string }) => e.stderr
    );
    await cleanup();
    const m = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)!;
    return { info: out, seconds: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) };
  };

  const { info, seconds } = await render([full(urlA), full(urlB)]);
  assert(Math.abs(seconds - 5) < 0.3, `expected ~5s, got ${seconds}`);

  // Trims: 0.5–1.5 of A (1s) + 1–end of B (2s) = 3s.
  const trimmed = await render([
    { url: urlA, trimStart: 0.5, trimEnd: 1.5 },
    { url: urlB, trimStart: 1, trimEnd: null },
  ]);
  assert(Math.abs(trimmed.seconds - 3) < 0.3, `trim: expected ~3s, got ${trimmed.seconds}`);

  // Cut: B split, second half moved first, middle dropped = 2s (B 2–3, then B 0–1).
  const cut = await render([
    { url: urlB, trimStart: 2, trimEnd: null },
    { url: urlB, trimStart: 0, trimEnd: 1 },
  ]);
  assert(Math.abs(cut.seconds - 2) < 0.3, `cut: expected ~2s, got ${cut.seconds}`);
  assert(/Audio: aac/.test(cut.info), "silent source still gets an audio track");
  assert(/Video: h264.*720x1280/.test(info), "output must be 720x1280 h264");
  assert(/Audio: aac/.test(info), "output must carry an audio track");

  // An expired clip surfaces a readable error instead of a crash.
  await assert.rejects(
    stitchClips([full("https://v3.fal.media/files/check/gone.mp4")], "16:9"),
    /expired/
  );
  await assert.rejects(stitchClips([full("https://example.com/x.mp4")], "16:9"), /not allowed/);

  await rm(dir, { recursive: true, force: true });
  console.log(
    `✔ omni checks passed (full ${seconds.toFixed(2)}s, trimmed ${trimmed.seconds.toFixed(2)}s, cut ${cut.seconds.toFixed(2)}s; 720x1280 h264+aac)`
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
