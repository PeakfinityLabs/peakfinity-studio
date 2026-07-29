import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";
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
  /** Admin-only view of archived rows, for restoring. */
  archived: z.enum(["1", "0"]).optional(),
});

const createSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  title: z.string().trim().min(1, "Title is required").max(300),
  lp: z.string().trim().max(1000).optional().nullable(),
  page: z.string().trim().max(120).optional().nullable(),
  strategist: z.string().trim().max(120).optional().nullable(),
  strategistUserId: z.string().trim().optional().nullable(),
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
  const { month, status, priority, page, editor, mine, archived } = parsed.data;
  const caps = trackerCaps(me);
  const showArchived = archived === "1" && caps.canArchive;

  // Admins and strategists see the whole board; editors see only rows assigned
  // to them or ones they added themselves.
  const ownOnly = !caps.canSeeAll || mine === "1";
  const ownFilter: Prisma.CreativeWhereInput = {
    OR: [
      { editorUserId: me.id },
      { editor: { equals: me.name, mode: "insensitive" } },
      { createdById: me.id },
    ],
  };
  // Archived rows are hidden everywhere except an admin's explicit archive view.
  const visible: Prisma.CreativeWhereInput = {
    archivedAt: showArchived ? { not: null } : null,
    ...(ownOnly ? ownFilter : {}),
  };

  const creatives = await prisma.creative.findMany({
    where: {
      ...visible,
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
    where: visible,
    distinct: ["month"],
    select: { month: true },
    orderBy: { month: "desc" },
  });

  const archivedCount = caps.canArchive
    ? await prisma.creative.count({ where: { archivedAt: { not: null } } })
    : 0;

  return NextResponse.json({
    creatives,
    months: months.map((m) => m.month),
    caps,
    archivedCount,
  });
}

// Anyone approved may add a creative — adding is safe and reversible.
export async function POST(req: Request) {
  const me = await apiGuard();
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
  const caps = trackerCaps(me);

  // An editor adding a row can't pre-assign it away from themselves or set
  // launch/score fields — they brief it in and it starts in the backlog.
  const data = caps.canEditAllFields
    ? { ...rest, launchedAt: launchedAt ? new Date(launchedAt) : null }
    : {
        month: rest.month,
        title: rest.title,
        page: rest.page,
        lp: rest.lp,
        briefLink: rest.briefLink,
        videoLink: rest.videoLink,
        notes: rest.notes,
        editor: me.name,
        editorUserId: me.id,
      };

  const creative = await prisma.creative.create({
    data: { ...data, createdById: me.id, createdByName: me.name },
  });

  await prisma.creativeChange.create({
    data: { creativeId: creative.id, userId: me.id, userName: me.name, action: "CREATE" },
  });

  return NextResponse.json({ creative }, { status: 201 });
}
