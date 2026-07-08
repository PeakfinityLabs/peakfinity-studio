import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { MODEL_SLUGS, type ModelSlug } from "@/lib/models/registry";
import { optimizerProvider } from "@/lib/optimizer/provider";
import { buildOptimizerSystemPrompt, OPTIMIZER_PRESETS } from "@/lib/optimizer/templates";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const optimizeSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(5000),
  model: z.enum(MODEL_SLUGS as [string, ...string[]]),
  preset: z.enum(OPTIMIZER_PRESETS).default("default"),
});

export async function POST(req: Request) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const limit = checkRateLimit(`optimize:${me.id}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit reached — try again in ${limit.retryAfterSeconds}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = optimizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const systemPrompt = buildOptimizerSystemPrompt(
    parsed.data.model as ModelSlug,
    parsed.data.preset
  );

  try {
    const optimizedPrompt = await optimizerProvider.complete(systemPrompt, parsed.data.prompt);
    return NextResponse.json({ optimizedPrompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Optimization failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
