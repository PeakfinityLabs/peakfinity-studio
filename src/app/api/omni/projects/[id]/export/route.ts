import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { fileSlug } from "@/lib/omni";
import { findOwnProject, stitchClips } from "@/lib/omni-server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Stitches the timeline (in order) into one MP4 and returns it as a download.
 * Runs ffmpeg on this server — no external API.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  // ponytail: synchronous render on the web instance; move to a background job if exports get long
  const limit = checkRateLimit(`omni-export:${me.id}`, 3, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Export already running — try again in ${limit.retryAfterSeconds}s` },
      { status: 429 }
    );
  }

  const { id } = await params;
  const project = await findOwnProject(me, id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const clips = await prisma.omniClip.findMany({
    where: { projectId: id },
    orderBy: { position: "asc" },
    select: { url: true, trimStart: true, trimEnd: true },
  });
  if (clips.length === 0) {
    return NextResponse.json({ error: "Add clips to the timeline first" }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof stitchClips>>;
  try {
    result = await stitchClips(clips, project.aspectRatio);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stitching failed";
    return NextResponse.json(
      {
        error: message.startsWith("Command failed")
          ? "Stitching failed — one of the clips may be corrupt"
          : message,
      },
      { status: 502 }
    );
  }
  try {
    const bytes = await readFile(result.file);
    return new Response(bytes, {
      headers: {
        "content-type": "video/mp4",
        "content-disposition": `attachment; filename="${fileSlug(project.name)}.mp4"`,
        "content-length": String(bytes.byteLength),
      },
    });
  } finally {
    await result.cleanup();
  }
}
