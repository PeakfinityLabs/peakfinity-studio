import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { visibleAvatarsWhere } from "@/lib/omni-server";

export const runtime = "nodejs";

/** Streams an avatar's image — only if the caller may see the avatar. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const avatar = await prisma.avatar.findFirst({
    where: { id, ...visibleAvatarsWhere(me) },
    select: { imageData: true, imageType: true },
  });
  if (!avatar) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(Buffer.from(avatar.imageData), {
    headers: {
      "content-type": avatar.imageType,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
