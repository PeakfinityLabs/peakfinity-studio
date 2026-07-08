/**
 * End-to-end smoke test: signs into the running app and generates one cheap
 * job per model through the real API routes, exercising fal queue submission,
 * the polling fallback, media persistence and the jobs API.
 *
 *   npm run smoke:fal                 # image models only (~5¢ total)
 *   npm run smoke:fal -- --video      # + Kling 3s and Seedance 4s@480p (~$0.80)
 *
 * Requires: dev server running (npm run dev), FAL_KEY set in .env.local, and a
 * registered account — pass SMOKE_EMAIL / SMOKE_PASSWORD env vars or flags
 * --email / --password. R2 creds optional (without them assets keep fal URLs).
 *
 * SPENDS REAL MONEY on the fal account. Video legs are opt-in for that reason.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const BASE_URL = opt("app") ?? "http://localhost:3000";
const EMAIL = opt("email") ?? process.env.SMOKE_EMAIL;
const PASSWORD = opt("password") ?? process.env.SMOKE_PASSWORD;
const RUN_VIDEO = flag("video");
const POLL_INTERVAL_MS = 4000;
const IMAGE_TIMEOUT_MS = 4 * 60 * 1000;
const VIDEO_TIMEOUT_MS = 15 * 60 * 1000;

// 64x64 red PNG — used as an uploaded reference / video start frame.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAUElEQVR4nO3PsQ0AIAzAsML/P5cXOnaJlD2z98GAOgCoA4A6AKgDgDoAqAOAOgCoA4A6AKgDgDoAqAOAOgCoA4A6AKgDgDoAqAOAOgCoDXwBBQMBOJm6nQAAAABJRU5ErkJggg==";

class Cookies {
  private jar = new Map<string, string>();
  absorb(res: Response) {
    for (const header of res.headers.getSetCookie?.() ?? []) {
      const [pair] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
  }
  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

const cookies = new Cookies();

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), cookie: cookies.header() },
    redirect: "manual",
  });
  cookies.absorb(res);
  return res;
}

async function readJson<T>(res: Response, context: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${context}: HTTP ${res.status} — ${text.slice(0, 200) || "empty response"}`);
  }
}

async function signIn(): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Set SMOKE_EMAIL and SMOKE_PASSWORD (or --email/--password)");
  }
  const csrfRes = await request("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD });
  const res = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status >= 400) throw new Error(`Sign-in failed: HTTP ${res.status}`);
  const check = await request("/api/auth/session");
  const session = (await check.json()) as { user?: { email?: string } };
  if (!session.user?.email) throw new Error("Sign-in failed: no session (wrong credentials?)");
  console.log(`✔ Signed in as ${session.user.email}`);
}

async function uploadReferenceImage(): Promise<string> {
  const bytes = Buffer.from(TINY_PNG_BASE64, "base64");
  const formData = new FormData();
  formData.append("files", new File([bytes], "smoke.png", { type: "image/png" }));
  const res = await request("/api/upload", { method: "POST", body: formData });
  const data = await readJson<{ files?: Array<{ url: string }>; error?: string }>(res, "Upload");
  if (!res.ok || !data.files?.[0]) throw new Error(`Upload failed: ${data.error ?? res.status}`);
  console.log(`✔ Reference uploaded → ${data.files[0].url}`);
  return data.files[0].url;
}

async function runJob(
  label: string,
  slug: string,
  params: Record<string, unknown>,
  timeoutMs: number
): Promise<void> {
  console.log(`\n▶ ${label}`);
  const submitRes = await request(`/api/generate/${slug}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const submitData = await readJson<{ jobId?: string; error?: string }>(submitRes, label);
  if (!submitRes.ok || !submitData.jobId) {
    throw new Error(`${label}: submit failed — ${submitData.error ?? submitRes.status}`);
  }
  console.log(`  job ${submitData.jobId} submitted`);

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`${label}: timed out after ${timeoutMs / 1000}s`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await request(`/api/jobs/${submitData.jobId}`);
    const { job } = await readJson<{
      job: {
        status: string;
        errorMessage?: string;
        queuePosition?: number | null;
        assets: Array<{ kind: string; url: string; r2Key?: string | null }>;
      };
    }>(res, label);
    if (job.status === "COMPLETED") {
      const outputs = job.assets.filter((a) => a.kind === "OUTPUT");
      if (outputs.length === 0) throw new Error(`${label}: completed but produced no assets`);
      const persisted = outputs.every((a) => a.url.startsWith("/api/media/"));
      console.log(
        `  ✔ COMPLETED — ${outputs.length} asset(s), ${persisted ? "persisted to R2" : "using fal URLs (R2 not configured)"}`
      );
      for (const asset of outputs) console.log(`    ${asset.url}`);
      return;
    }
    if (job.status === "FAILED" || job.status === "CANCELLED") {
      throw new Error(`${label}: ${job.status} — ${job.errorMessage ?? "no error message"}`);
    }
    process.stdout.write(
      `  … ${job.status}${job.queuePosition != null ? ` (queue ${job.queuePosition})` : ""}\r`
    );
  }
}

async function main() {
  console.log(`Smoke-testing against ${BASE_URL} (video legs: ${RUN_VIDEO ? "ON" : "off"})`);
  await signIn();
  const referenceUrl = await uploadReferenceImage();

  await runJob(
    "Nano Banana 2 (text-to-image, 0.5K)",
    "nano-banana-2",
    {
      prompt: "A single red apple on a plain white background, studio product shot",
      resolution: "0.5K",
      num_images: 1,
      aspect_ratio: "1:1",
      output_format: "jpeg",
    },
    IMAGE_TIMEOUT_MS
  );

  await runJob(
    "GPT Image 2 (edit, low quality)",
    "gpt-image-2",
    {
      prompt: "Make the image blue",
      image_urls: [referenceUrl],
      quality: "low",
      num_images: 1,
      output_format: "jpeg",
    },
    IMAGE_TIMEOUT_MS
  );

  if (RUN_VIDEO) {
    await runJob(
      "Kling O3 (3s, no audio)",
      "kling-o3",
      {
        image_url: referenceUrl,
        prompt: "The camera slowly zooms in",
        duration: "3",
        generate_audio: false,
      },
      VIDEO_TIMEOUT_MS
    );

    await runJob(
      "Seedance 2.0 (4s, 480p)",
      "seedance-2",
      {
        prompt: "@Image1 gently pulses and glows",
        image_urls: [referenceUrl],
        resolution: "480p",
        duration: "4",
        generate_audio: false,
      },
      VIDEO_TIMEOUT_MS
    );
  }

  console.log("\n✅ Smoke test passed");
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
