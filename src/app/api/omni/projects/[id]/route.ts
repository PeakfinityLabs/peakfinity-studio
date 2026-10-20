import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { MAX_AVATARS, OMNI_ASPECT_RATIOS } from "@/lib/omni";
import { findOwnProject, usableAvatarIds } from "@/lib/omni-server";
import { refreshOmnirouterJob } from "@/lib/jobs/omnirouter-jobs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name the project").max(80).optional(),
  aspectRatio: z.enum(OMNI_ASPECT_RATIOS).optional(),
  avatarIds: z.array(z.string().min(1)).max(MAX_AVATARS).optional(),
});

/** Project + its timeline + the generations made inside it. Owner only. */
export async function GET(_req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const project = await prisma.omniProject.findFirst({
    where: { id, userId: me.id },
    include: { clips: { orderBy: { position: "asc" } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const where = {
    userId: me.id,
    model: "OMNI_FLASH" as const,
    input: { path: ["projectId"], equals: id },
  };
  // No provider webhooks: settle this project's open generations on each view.
  const open = await prisma.job.findMany({
    where: { ...where, status: { in: ["IN_QUEUE", "IN_PROGRESS"] } },
    select: { id: true, status: true, falRequestId: true, input: true },
    take: 10,
  });
  await Promise.all(open.map((j) => refreshOmnirouterJob(j).catch(() => undefined)));

  const generations = await prisma.job.findMany({
    where,
    include: { assets: { where: { kind: "OUTPUT" } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      aspectRatio: project.aspectRatio,
      // Drop avatars deleted or made private since they were picked.
      avatarIds: await usableAvatarIds(me, project.avatarIds),
      clips: project.clips.map((c) => ({
        id: c.id,
        label: c.label,
        url: c.url,
        sourceJobId: c.sourceJobId,
        trimStart: c.trimStart,
        trimEnd: c.trimEnd,
      })),
    },
    generations: generations.map((job) => {
      const input = job.input as { mode?: string; params?: Record<string, unknown> };
      return {
        id: job.id,
        status: job.status,
        prompt: job.prompt,
        mode: input.mode ?? "create",
        duration: input.params?.duration ?? null,
        createdAt: job.createdAt,
        outputUrl: job.assets.find((a) => a.contentType.startsWith("video/"))?.url ?? null,
        errorMessage: job.errorMessage,
      };
    }),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  if (!(await findOwnProject(me, id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const data = { ...parsed.data };
  if (data.avatarIds) {
    const ok = await usableAvatarIds(me, data.avatarIds);
    if (ok.length !== new Set(data.avatarIds).size) {
      return NextResponse.json(
        { error: "One of the avatars is no longer available" },
        { status: 404 }
      );
    }
    data.avatarIds = ok;
  }
  await prisma.omniProject.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

/** Deletes the project and its timeline. Its generations stay in the Library. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const deleted = await prisma.omniProject.deleteMany({ where: { id, userId: me.id } });
  if (deleted.count === 0)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
