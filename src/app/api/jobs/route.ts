import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { GenModel, JobStatus, JobType } from "@/generated/prisma/client";

export const runtime = "nodejs";

const listQuerySchema = z.object({
  mine: z.enum(["1", "0"]).optional(),
  model: z.nativeEnum(GenModel).optional(),
  type: z.nativeEnum(JobType).optional(),
  status: z.nativeEnum(JobStatus).optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(24),
  sinceDays: z.coerce.number().int().min(1).max(365).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.issues }, { status: 400 });
  }
  const { mine, model, type, status, cursor, take, sinceDays } = parsed.data;

  const jobs = await prisma.job.findMany({
    where: {
      ...(mine === "1" ? { userId: session.user.id } : {}),
      ...(model ? { model } : {}),
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(sinceDays
        ? { createdAt: { gte: new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) } }
        : {}),
    },
    include: {
      assets: { where: { kind: "OUTPUT" } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = jobs.length > take;
  const page = hasMore ? jobs.slice(0, take) : jobs;

  return NextResponse.json({
    jobs: page.map((job) => ({
      id: job.id,
      model: job.model,
      type: job.type,
      status: job.status,
      prompt: job.prompt,
      optimizedPrompt: job.optimizedPrompt,
      estimatedCostCents: job.estimatedCostCents,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      user: job.user,
      assets: job.assets.map((a) => ({
        id: a.id,
        url: a.url,
        contentType: a.contentType,
        width: a.width,
        height: a.height,
      })),
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
