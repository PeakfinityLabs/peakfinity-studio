import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard, type SessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { CreativePriority, CreativeStatus } from "@/generated/prisma/enums";
import type { Creative } from "@/generated/prisma/client";

export const runtime = "nodejs";

const patchSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  lp: z.string().trim().max(1000).nullable().optional(),
  page: z.string().trim().max(120).nullable().optional(),
  strategist: z.string().trim().max(120).nullable().optional(),
  briefLink: z.string().trim().max(1000).nullable().optional(),
  editor: z.string().trim().max(120).nullable().optional(),
  editorUserId: z.string().trim().nullable().optional(),
  videoLink: z.string().trim().max(1000).nullable().optional(),
  contentNeeded: z.boolean().optional(),
  status: z.nativeEnum(CreativeStatus).optional(),
  priority: z.nativeEnum(CreativePriority).optional(),
  aiModel: z.string().trim().max(120).nullable().optional(),
  generations: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  launchedAt: z.string().datetime().nullable().optional(),
  cogScore: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  isWinner: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

/** Fields a non-admin editor may change on a row assigned to them. */
const EDITOR_FIELDS = new Set(["status", "videoLink", "generations", "notes"]);

function isAssignedTo(creative: Creative, me: SessionUser): boolean {
  if (creative.editorUserId && creative.editorUserId === me.id) return true;
  return Boolean(creative.editor && creative.editor.toLowerCase() === me.name.toLowerCase());
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const creative = await prisma.creative.findUnique({ where: { id } });
  if (!creative) return NextResponse.json({ error: "Creative not found" }, { status: 404 });

  const isAdmin = me.role === "ADMIN";
  if (!isAdmin && !isAssignedTo(creative, me)) {
    // 404 rather than 403 — don't reveal rows the user can't see.
    return NextResponse.json({ error: "Creative not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Editors are limited to their own progress fields — they can't reassign a
  // row, change its priority, or mark it launched.
  if (!isAdmin) {
    const attempted = Object.keys(parsed.data);
    const forbidden = attempted.filter((k) => !EDITOR_FIELDS.has(k));
    if (forbidden.length > 0) {
      return NextResponse.json(
        { error: `You can only update: ${[...EDITOR_FIELDS].join(", ")}` },
        { status: 403 }
      );
    }
  }

  const { launchedAt, ...rest } = parsed.data;
  const updated = await prisma.creative.update({
    where: { id },
    data: {
      ...rest,
      ...(launchedAt !== undefined
        ? { launchedAt: launchedAt ? new Date(launchedAt) : null }
        : {}),
    },
  });
  return NextResponse.json({ creative: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const existing = await prisma.creative.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Creative not found" }, { status: 404 });

  await prisma.creative.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
