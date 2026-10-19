import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { OMNI_ENDPOINT, omniGenerateSchema } from "@/lib/omni";
import { findOwnProject, visibleAvatarsWhere } from "@/lib/omni-server";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

/**
 * Omni Flash generation request. The API is NOT connected yet: the request is
 * validated and saved as a queued OMNI_FLASH job (admins see it in the
 * Library), and nothing is sent to any provider.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  // Same per-user budget as the studio's generate route.
  const limit = checkRateLimit(`generate:${me.id}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit reached — try again in ${limit.retryAfterSeconds}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  const { id } = await params;
  const project = await findOwnProject(me, id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const parsed = omniGenerateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { avatar_ids, source_clip_id, ...rest } = parsed.data;

  // Only avatars this user can see (shared, or their own private ones).
  const avatars = avatar_ids.length
    ? await prisma.avatar.findMany({
        where: { id: { in: avatar_ids }, ...visibleAvatarsWhere(me) },
        select: { id: true, name: true },
      })
    : [];
  if (avatars.length !== new Set(avatar_ids).size) {
    return NextResponse.json(
      { error: "One of the avatars is no longer available" },
      { status: 404 }
    );
  }

  let sourceClip: { id: string; url: string } | null = null;
  if (rest.mode === "extend") {
    sourceClip = await prisma.omniClip.findFirst({
      where: { id: source_clip_id, projectId: id },
      select: { id: true, url: true },
    });
    if (!sourceClip)
      return NextResponse.json({ error: "Clip not found in this project" }, { status: 404 });
  }

  // Only the inputs the chosen mode uses are kept.
  const modeParams: Record<string, unknown> = {
    prompt: rest.prompt,
    aspect_ratio: rest.aspect_ratio,
    duration: rest.duration,
    resolution: rest.resolution,
    ...(rest.mode === "create" || rest.mode === "edit" ? { image_urls: rest.image_urls } : {}),
    ...(rest.mode === "animate" ? { image_url: rest.image_url } : {}),
    ...(rest.mode === "edit" ? { video_url: rest.video_url } : {}),
    ...(sourceClip ? { video_url: sourceClip.url } : {}),
  };

  const inputUrls = [
    ...(rest.mode === "create" || rest.mode === "edit" ? rest.image_urls : []),
    ...(typeof modeParams.image_url === "string" ? [modeParams.image_url] : []),
    ...(typeof modeParams.video_url === "string" ? [modeParams.video_url] : []),
  ];

  const job = await prisma.job.create({
    data: {
      userId: me.id,
      model: "OMNI_FLASH",
      type: "VIDEO",
      status: "IN_QUEUE",
      input: {
        endpoint: OMNI_ENDPOINT,
        params: modeParams,
        mode: rest.mode,
        projectId: id,
        projectName: project.name,
        avatars,
        ...(sourceClip ? { sourceClipId: sourceClip.id } : {}),
      } as Prisma.InputJsonValue,
      prompt: rest.prompt,
      estimatedCostCents: 0, // usage amounts come with the API hookup
      assets: {
        create: inputUrls.map((url) => ({
          kind: "INPUT" as const,
          url,
          contentType: "application/octet-stream",
        })),
      },
    },
  });
  await prisma.omniProject.update({ where: { id }, data: { updatedAt: new Date() } });

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
