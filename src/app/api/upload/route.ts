import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { fal } from "@/lib/fal/client";

export const runtime = "nodejs";

const MAX_FILES = 12;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // Seedance's largest per-file limit (videos)
const ALLOWED_PREFIXES = ["image/", "video/", "audio/"];

export async function POST(req: Request) {
  const gate = await apiGuard();
  if (gate instanceof NextResponse) return gate;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    // A body truncated at the middleware size cap fails to parse as multipart.
    return NextResponse.json(
      { error: `Upload too large or malformed — each file must be under ${MAX_FILE_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `At most ${MAX_FILES} files per upload` }, { status: 400 });
  }
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${file.name} exceeds the ${MAX_FILE_BYTES / 1024 / 1024}MB limit` },
        { status: 400 }
      );
    }
    if (!ALLOWED_PREFIXES.some((p) => file.type.startsWith(p))) {
      return NextResponse.json(
        { error: `${file.name}: only image, video and audio files are allowed` },
        { status: 400 }
      );
    }
  }

  try {
    const uploaded = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        size: file.size,
        contentType: file.type,
        url: await fal.storage.upload(file),
      }))
    );
    return NextResponse.json({ files: uploaded });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fal upload failed";
    return NextResponse.json(
      { error: `fal storage upload failed: ${message} (is FAL_KEY set?)` },
      { status: 502 }
    );
  }
}
