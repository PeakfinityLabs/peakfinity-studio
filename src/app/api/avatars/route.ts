import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  AVATAR_IMAGE_TYPES,
  avatarFieldsSchema,
  avatarImageUrl,
  MAX_AVATAR_BYTES,
} from "@/lib/omni";
import { visibleAvatarsWhere } from "@/lib/omni-server";

export const runtime = "nodejs";

/** Team avatars (shared) plus the caller's own private ones. */
export async function GET() {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const avatars = await prisma.avatar.findMany({
    where: visibleAvatarsWhere(me),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      shared: true,
      createdAt: true,
      createdById: true,
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json({
    avatars: avatars.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      shared: a.shared,
      createdAt: a.createdAt,
      createdByName: a.createdBy.name,
      mine: a.createdById === me.id,
      imageUrl: avatarImageUrl(a.id),
    })),
  });
}

/** multipart: image (≤2MB jpeg/png/webp), name, description?, shared ("1"/"0"). */
export async function POST(req: Request) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Upload too large or malformed" }, { status: 413 });
  }
  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Add a reference image" }, { status: 400 });
  }
  if (!(AVATAR_IMAGE_TYPES as readonly string[]).includes(image.type)) {
    return NextResponse.json({ error: "Use a JPG, PNG or WebP image" }, { status: 400 });
  }
  if (image.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "Image must be under 2MB" }, { status: 400 });
  }

  const parsed = avatarFieldsSchema.safeParse({
    name: form.get("name"),
    description: form.get("description") || undefined,
    shared: form.get("shared") !== "0",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const avatar = await prisma.avatar.create({
    data: {
      ...parsed.data,
      imageData: new Uint8Array(await image.arrayBuffer()),
      imageType: image.type,
      createdById: me.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ avatar }, { status: 201 });
}
