import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { CreativePriority, CreativeStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

const listQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  status: z.nativeEnum(CreativeStatus).optional(),
  priority: z.nativeEnum(CreativePriority).optional(),
  page: z.string().optional(),
  editor: z.string().optional(),
  mine: z.enum(["1", "0"]).optional(),
});

const createSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  title: z.string().trim().min(1, "Title is required").max(300),
  lp: z.string().trim().max(1000).optional().nullable(),
  page: z.string().trim().max(120).optional().nullable(),
  strategist: z.string().trim().max(120).optional().nullable(),
  briefLink: z.string().trim().max(1000).optional().nullable(),
  editor: z.string().trim().max(120).optional().nullable(),
  editorUserId: z.string().trim().optional().nullable(),
  videoLink: z.string().trim().max(1000).optional().nullable(),
  contentNeeded: z.boolean().optional(),
  status: z.nativeEnum(CreativeStatus).optional(),
  priority: z.nativeEnum(CreativePriority).optional(),
  aiModel: z.string().trim().max(120).optional().nullable(),
  generations: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  launchedAt: z.string().datetime().optional().nullable(),
  cogScore: z.coerce.number().int().min(0).max(1000).optional().nullable(),
  isWinner: z.boolean().optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

export async function GET(req: Request) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { month, status, priority, page, editor, mine } = parsed.data;

  // Editors only ever see their own assignments; admins see everything.
  const ownOnly = me.role !== "ADMIN" || mine === "1";
  const ownFilter: Prisma.CreativeWhereInput = {
    OR: [{ editorUserId: me.id }, { editor: { equals: me.name, mode: "insensitive" } }],
  };

  const creatives = await prisma.creative.findMany({
    where: {
      ...(ownOnly ? ownFilter : {}),
      ...(month ? { month } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(page ? { page } : {}),
      ...(editor ? { editor: { equals: editor, mode: "insensitive" } } : {}),
    },
    orderBy: [{ month: "desc" }, { createdAt: "asc" }],
  });

  // Month list for the filter dropdown (all months the user can see).
  const months = await prisma.creative.findMany({
    where: ownOnly ? ownFilter : {},
    distinct: ["month"],
    select: { month: true },
    orderBy: { month: "desc" },
  });

  return NextResponse.json({
    creatives,
    months: months.map((m) => m.month),
    canManage: me.role === "ADMIN",
  });
}

export async function POST(req: Request) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { launchedAt, ...rest } = parsed.data;
  const creative = await prisma.creative.create({
    data: {
      ...rest,
      launchedAt: launchedAt ? new Date(launchedAt) : null,
    },
  });
  return NextResponse.json({ creative }, { status: 201 });
}
