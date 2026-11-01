import { NextResponse } from "next/server";
import { z } from "zod";
import { POST as generateInProject } from "@/app/api/omni/projects/[id]/generate/route";

export const runtime = "nodejs";

/**
 * Script API (Authorization: Bearer pst_… — make one under your name → API tokens):
 *   POST { project_id, mode?, prompt, duration?, server?, avatar_ids? | avatar_id?, image_urls?, image_url?, video_url?, source_clip_id? }
 *     → 201 { id, status: "queued" }
 *   POST { items: [ …same, up to 50 ] } → 207 { results: [{ index, id } | { index, error }] }
 * The fields match the Omni generate panel; this calls the exact same handler.
 */
const itemSchema = z
  .object({ project_id: z.string().min(1, "project_id is required"), avatar_id: z.string().min(1).optional() })
  .passthrough();

async function submitOne(req: Request, raw: unknown): Promise<{ id: string } | { error: string; status: number }> {
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid item", status: 400 };
  const { project_id, avatar_id, ...rest } = parsed.data;
  const body = {
    ...rest,
    avatar_ids: (rest.avatar_ids as unknown) ?? (avatar_id ? [avatar_id] : []),
    duration: rest.duration === undefined ? undefined : String(rest.duration),
    server: rest.server === undefined ? undefined : String(rest.server),
  };
  // Re-enters the Omni generate route with the caller's auth header (bearer token or cookie).
  const inner = new Request(req.url, {
    method: "POST",
    headers: { authorization: req.headers.get("authorization") ?? "", cookie: req.headers.get("cookie") ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await generateInProject(inner, { params: Promise.resolve({ id: project_id }) });
  const data = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
  return data.jobId ? { id: data.jobId } : { error: data.error ?? `Failed (${res.status})`, status: res.status };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  if (Array.isArray(body.items)) {
    if (body.items.length === 0 || body.items.length > 50) {
      return NextResponse.json({ error: "Send 1–50 items" }, { status: 400 });
    }
    // Sequential: keeps the per-user rate limit honest and the provider unhammered.
    const results = [];
    for (const [index, item] of body.items.entries()) {
      const r = await submitOne(req, item);
      results.push("id" in r ? { index, id: r.id, status: "queued" } : { index, error: r.error });
      if ("status" in r && r.status === 401) break;
    }
    return NextResponse.json({ results }, { status: 207 });
  }

  const r = await submitOne(req, body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ id: r.id, status: "queued" }, { status: 201 });
}
