import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fileSlug } from "@/lib/omni";
import { fetchClipBytes, findOwnProject } from "@/lib/omni-server";

export const runtime = "nodejs";

/**
 * Downloads one timeline clip as an attachment. Proxied (rather than linking
 * the CDN URL) because browsers ignore `download` on cross-origin links and
 * would just play the video in a new tab.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; clipId: string }> }
) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id, clipId } = await params;
  const project = await findOwnProject(me, id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const clips = await prisma.omniClip.findMany({
    where: { projectId: id },
    orderBy: { position: "asc" },
    select: { id: true, url: true },
  });
  const index = clips.findIndex((c) => c.id === clipId);
  if (index === -1) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  try {
    const { bytes, contentType } = await fetchClipBytes(clips[index].url);
    const name = `${fileSlug(project.name)}-clip-${index + 1}.mp4`;
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": contentType.startsWith("video/") ? contentType : "video/mp4",
        "content-disposition": `attachment; filename="${name}"`,
        "content-length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 502 }
    );
  }
}
