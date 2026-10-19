import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { MAX_AVATARS, OMNI_ASPECT_RATIOS } from "@/lib/omni";
import { usableAvatarIds } from "@/lib/omni-server";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name the project").max(80),
  aspectRatio: z.enum(OMNI_ASPECT_RATIOS).default("9:16"),
  avatarIds: z.array(z.string().min(1)).max(MAX_AVATARS).default([]),
});

/** The caller's own projects only — projects are never shared, admins included. */
export async function GET() {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const projects = await prisma.omniProject.findMany({
    where: { userId: me.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { clips: true } },
      clips: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
    },
  });

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      aspectRatio: p.aspectRatio,
      updatedAt: p.updatedAt,
      clipCount: p._count.clips,
      coverUrl: p.clips[0]?.url ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const avatarIds = await usableAvatarIds(me, parsed.data.avatarIds);
  if (avatarIds.length !== new Set(parsed.data.avatarIds).size) {
    return NextResponse.json(
      { error: "One of the avatars is no longer available" },
      { status: 404 }
    );
  }
  const project = await prisma.omniProject.create({
    data: { ...parsed.data, avatarIds, userId: me.id },
  });
  return NextResponse.json({ project: { id: project.id } }, { status: 201 });
}
