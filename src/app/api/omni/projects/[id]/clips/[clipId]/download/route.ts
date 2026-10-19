import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fileSlug } from "@/lib/omni";
import { readFile } from "node:fs/promises";
import { fetchClipBytes, findOwnProject, stitchClips } from "@/lib/omni-server";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    select: { id: true, url: true, trimStart: true, trimEnd: true },
  });
  const index = clips.findIndex((c) => c.id === clipId);
  if (index === -1) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const clip = clips[index];
  const name = `${fileSlug(project.name)}-clip-${index + 1}.mp4`;
  const headers = (contentType: string, length: number) => ({
    "content-type": contentType.startsWith("video/") ? contentType : "video/mp4",
    "content-disposition": `attachment; filename="${name}"`,
    "content-length": String(length),
  });
  try {
    // Untrimmed clips download as the original file; trimmed/cut ones are rendered.
    if (clip.trimStart === 0 && clip.trimEnd === null) {
      const { bytes, contentType } = await fetchClipBytes(clip.url);
      return new Response(Buffer.from(bytes), { headers: headers(contentType, bytes.byteLength) });
    }
    const result = await stitchClips([clip], project.aspectRatio);
    try {
      const bytes = await readFile(result.file);
      return new Response(bytes, { headers: headers("video/mp4", bytes.byteLength) });
    } finally {
      await result.cleanup();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 502 }
    );
  }
}
