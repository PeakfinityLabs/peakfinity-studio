import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { MODEL_SLUGS } from "@/lib/models/registry";
import { optimizerProvider } from "@/lib/optimizer/provider";
import { OPTIMIZER_TEMPLATES } from "@/lib/optimizer/templates";

export const runtime = "nodejs";

const optimizeSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(5000),
  model: z.enum(MODEL_SLUGS as [string, ...string[]]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const systemPrompt = OPTIMIZER_TEMPLATES[parsed.data.model as keyof typeof OPTIMIZER_TEMPLATES];

  try {
    const optimizedPrompt = await optimizerProvider.complete(systemPrompt, parsed.data.prompt);
    return NextResponse.json({ optimizedPrompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Optimization failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
