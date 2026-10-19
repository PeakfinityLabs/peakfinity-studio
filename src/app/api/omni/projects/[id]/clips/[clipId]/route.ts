import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { MAX_CLIPS_PER_PROJECT } from "@/lib/omni";
import { findOwnProject } from "@/lib/omni-server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; clipId: string }> };

const MIN_SECONDS = 0.1;

const trimSchema = z
  .object({
    trimStart: z.number().min(0).max(3600),
    trimEnd: z.number().min(0).max(3600).nullable(),
  })
  .refine((t) => t.trimEnd === null || t.trimEnd - t.trimStart >= MIN_SECONDS, {
    message: "A clip must be at least 0.1s long",
  });

/** Trim: set the clip's in/out points (seconds of the source; never alters the file). */
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id, clipId } = await params;
  if (!(await findOwnProject(me, id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const parsed = trimSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid trim" },
      { status: 400 }
    );
  }
  const updated = await prisma.omniClip.updateMany({
    where: { id: clipId, projectId: id },
    data: parsed.data,
  });
  if (updated.count === 0) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

const splitSchema = z.object({ at: z.number().min(0).max(3600) });

/**
 * Cut: split the clip at `at` (source seconds) into two clips over the same
 * source — this one ends at `at`, a new one right after it starts there.
 */
export async function POST(req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id, clipId } = await params;
  if (!(await findOwnProject(me, id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const parsed = splitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cut point" }, { status: 400 });
  const { at } = parsed.data;

  const clip = await prisma.omniClip.findFirst({ where: { id: clipId, projectId: id } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  if (
    at - clip.trimStart < MIN_SECONDS ||
    (clip.trimEnd !== null && clip.trimEnd - at < MIN_SECONDS)
  ) {
    return NextResponse.json(
      { error: "Move the playhead inside the clip to cut" },
      { status: 400 }
    );
  }
  const count = await prisma.omniClip.count({ where: { projectId: id } });
  if (count >= MAX_CLIPS_PER_PROJECT) {
    return NextResponse.json(
      { error: `A project holds at most ${MAX_CLIPS_PER_PROJECT} clips` },
      { status: 400 }
    );
  }

  const [, , created] = await prisma.$transaction([
    prisma.omniClip.updateMany({
      where: { projectId: id, position: { gt: clip.position } },
      data: { position: { increment: 1 } },
    }),
    prisma.omniClip.update({ where: { id: clip.id }, data: { trimEnd: at } }),
    prisma.omniClip.create({
      data: {
        projectId: id,
        position: clip.position + 1,
        label: clip.label.endsWith(" (part 2)")
          ? clip.label
          : `${clip.label.slice(0, 70)} (part 2)`,
        url: clip.url,
        sourceJobId: clip.sourceJobId,
        trimStart: at,
        trimEnd: clip.trimEnd,
      },
    }),
    prisma.omniProject.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  return NextResponse.json({ clip: { id: created.id } }, { status: 201 });
}

/** Removes a clip from the timeline (the source generation is untouched). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id, clipId } = await params;
  if (!(await findOwnProject(me, id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const deleted = await prisma.omniClip.deleteMany({ where: { id: clipId, projectId: id } });
  if (deleted.count === 0) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
