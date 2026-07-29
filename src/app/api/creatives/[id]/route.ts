import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard, type SessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EDITOR_EDITABLE_FIELDS, trackerCaps } from "@/lib/creatives";
import { CreativePriority, CreativeStatus } from "@/generated/prisma/enums";
import type { Creative, Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

const patchSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  lp: z.string().trim().max(1000).nullable().optional(),
  page: z.string().trim().max(120).nullable().optional(),
  strategist: z.string().trim().max(120).nullable().optional(),
  strategistUserId: z.string().trim().nullable().optional(),
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

const EDITOR_FIELDS = new Set<string>(EDITOR_EDITABLE_FIELDS);

function isAssignedTo(creative: Creative, me: SessionUser): boolean {
  if (creative.editorUserId) return creative.editorUserId === me.id;
  if (creative.createdById === me.id) return true;
  // Name fallback only for unlinked legacy rows — User.name isn't unique, so
  // this must never override an explicit assignment.
  return Boolean(creative.editor && creative.editor.toLowerCase() === me.name.toLowerCase());
}

/** Diff of what actually changed, for the audit trail. */
function diff(before: Creative, after: Record<string, unknown>) {
  const out: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const [field, to] of Object.entries(after)) {
    const from = (before as unknown as Record<string, unknown>)[field];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (norm(from) !== norm(to)) out.push({ field, from: norm(from) ?? null, to: norm(to) ?? null });
  }
  return out;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const creative = await prisma.creative.findUnique({ where: { id } });
  if (!creative) return NextResponse.json({ error: "Creative not found" }, { status: 404 });

  const caps = trackerCaps(me);
  if (!caps.canSeeAll && !isAssignedTo(creative, me)) {
    // 404 rather than 403 — don't reveal rows the user can't see.
    return NextResponse.json({ error: "Creative not found" }, { status: 404 });
  }
  if (creative.archivedAt) {
    return NextResponse.json({ error: "This creative is archived" }, { status: 409 });
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

  // Editors may only touch the video link — they can't reassign a row, change
  // its priority or status, or mark it launched.
  if (!caps.canEditAllFields) {
    const forbidden = Object.keys(parsed.data).filter((k) => !EDITOR_FIELDS.has(k));
    if (forbidden.length > 0) {
      return NextResponse.json(
        { error: `You can only update the video link on this creative.` },
        { status: 403 }
      );
    }
  }

  const { launchedAt, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(launchedAt !== undefined
      ? { launchedAt: launchedAt ? new Date(launchedAt) : null }
      : {}),
  };

  const changed = diff(creative, data);
  const updated = await prisma.creative.update({ where: { id }, data });

  if (changed.length > 0) {
    await prisma.creativeChange.create({
      data: {
        creativeId: id,
        userId: me.id,
        userName: me.name,
        action: "UPDATE",
        changes: changed as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return NextResponse.json({ creative: updated });
}

/**
 * Archive (soft delete) — admins only, and always recoverable. There is no
 * hard-delete path: a row can never be lost by someone "going rogue".
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  if (!trackerCaps(me).canArchive) {
    return NextResponse.json(
      { error: "Only admins can remove a creative." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const existing = await prisma.creative.findUnique({
    where: { id },
    select: { id: true, archivedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
  if (existing.archivedAt) return NextResponse.json({ archived: true });

  await prisma.creative.update({
    where: { id },
    data: { archivedAt: new Date(), archivedBy: me.name },
  });
  await prisma.creativeChange.create({
    data: { creativeId: id, userId: me.id, userName: me.name, action: "ARCHIVE" },
  });

  return NextResponse.json({ archived: true });
}
