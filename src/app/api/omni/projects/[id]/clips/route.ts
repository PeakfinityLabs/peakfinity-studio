import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { isAllowedClipUrl, MAX_CLIPS_PER_PROJECT } from "@/lib/omni";
import { findOwnProject } from "@/lib/omni-server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const addSchema = z.union([
  /** Insert one of your own completed generations onto the timeline. */
  z.object({ jobId: z.string().min(1) }),
  /** Insert an uploaded video (already on fal storage via /api/upload). */
  z.object({ url: z.url(), label: z.string().trim().min(1).max(80) }),
]);

const reorderSchema = z.object({ order: z.array(z.string().min(1)).max(MAX_CLIPS_PER_PROJECT) });

export async function POST(req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  if (!(await findOwnProject(me, id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  let clip: { url: string; label: string; sourceJobId: string | null };
  if ("jobId" in parsed.data) {
    // Your own generations only — the timeline never pulls in someone else's work.
    const job = await prisma.job.findFirst({
      where: { id: parsed.data.jobId, userId: me.id, type: "VIDEO", status: "COMPLETED" },
      include: { assets: { where: { kind: "OUTPUT" } } },
    });
    const video = job?.assets.find((a) => a.contentType.startsWith("video/"));
    if (!job || !video) {
      return NextResponse.json(
        { error: "That generation has no finished video yet" },
        { status: 404 }
      );
    }
    clip = {
      url: video.url,
      label: job.prompt.slice(0, 80) || "Generated clip",
      sourceJobId: job.id,
    };
  } else {
    clip = { ...parsed.data, sourceJobId: null };
  }
  if (!isAllowedClipUrl(clip.url)) {
    return NextResponse.json(
      { error: "Upload the video through the studio first" },
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
  const last = await prisma.omniClip.findFirst({
    where: { projectId: id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const [created] = await prisma.$transaction([
    prisma.omniClip.create({
      data: { ...clip, projectId: id, position: (last?.position ?? -1) + 1 },
    }),
    prisma.omniProject.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  return NextResponse.json({ clip: { id: created.id } }, { status: 201 });
}

/** Reorder: `order` must list exactly the project's clip ids. */
export async function PUT(req: Request, { params }: Ctx) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  if (!(await findOwnProject(me, id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid order" }, { status: 400 });

  const existing = await prisma.omniClip.findMany({
    where: { projectId: id },
    select: { id: true },
  });
  const order = parsed.data.order;
  const same =
    order.length === existing.length &&
    new Set(order).size === order.length &&
    existing.every((c) => order.includes(c.id));
  if (!same)
    return NextResponse.json({ error: "Timeline changed — reload and try again" }, { status: 409 });

  await prisma.$transaction([
    ...order.map((clipId, position) =>
      prisma.omniClip.update({ where: { id: clipId }, data: { position } })
    ),
    prisma.omniProject.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
