import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getUsageSummary } from "@/lib/usage";

export const runtime = "nodejs";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const summary = await getUsageSummary(parsed.data.days ?? 30);
  return NextResponse.json(summary);
}
