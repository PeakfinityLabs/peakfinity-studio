import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { fal } from "@/lib/fal/client";
import { isModelSlug, MODELS } from "@/lib/models/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Prisma } from "@/generated/prisma/client";

const GENERATE_LIMIT = 10; // per user per minute — protects the fal budget

export const runtime = "nodejs";

function webhookUrl(): string | undefined {
  const base = process.env.APP_BASE_URL;
  // fal can't call back to localhost — local dev relies on the polling fallback.
  if (!base || /localhost|127\.0\.0\.1/.test(base)) return undefined;
  return `${base.replace(/\/$/, "")}/api/fal/webhook`;
}

function collectInputUrls(params: Record<string, unknown>): string[] {
  const urls: string[] = [];
  for (const key of ["image_urls", "video_urls", "audio_urls"]) {
    const value = params[key];
    if (Array.isArray(value)) urls.push(...value.filter((v): v is string => typeof v === "string"));
  }
  for (const key of ["image_url", "end_image_url", "mask_url"]) {
    const value = params[key];
    if (typeof value === "string") urls.push(value);
  }
  return urls;
}

export async function POST(req: Request, { params }: { params: Promise<{ model: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(`generate:${session.user.id}`, GENERATE_LIMIT, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit reached — try again in ${limit.retryAfterSeconds}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  const { model: slug } = await params;
  if (!isModelSlug(slug)) {
    return NextResponse.json({ error: `Unknown model: ${slug}` }, { status: 404 });
  }
  const def = MODELS[slug];

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = def.schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const modelParams = parsed.data;
  const endpoint = def.resolveEndpoint(modelParams);
  const falInput = def.toFalInput(modelParams);
  const estimatedCostCents = def.estimateCostCents(modelParams);

  const { request_id: falRequestId } = await fal.queue.submit(endpoint, {
    input: falInput,
    webhookUrl: webhookUrl(),
  });

  const prompt = typeof modelParams.prompt === "string" ? modelParams.prompt : "";
  const optimizedPrompt =
    typeof (body as Record<string, unknown>)?.["_originalPrompt"] === "string" ? prompt : null;
  const originalPrompt =
    typeof (body as Record<string, unknown>)?.["_originalPrompt"] === "string"
      ? ((body as Record<string, unknown>)["_originalPrompt"] as string)
      : prompt;

  const job = await prisma.job.create({
    data: {
      userId: session.user.id,
      model: def.genModel,
      type: def.type,
      status: "IN_QUEUE",
      falRequestId,
      input: { endpoint, params: falInput } as Prisma.InputJsonValue,
      prompt: originalPrompt,
      optimizedPrompt,
      estimatedCostCents,
      assets: {
        create: collectInputUrls(modelParams).map((url) => ({
          kind: "INPUT" as const,
          url,
          contentType: "application/octet-stream",
        })),
      },
    },
  });

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
