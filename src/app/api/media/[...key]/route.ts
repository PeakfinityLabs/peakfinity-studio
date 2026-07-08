import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { getFromR2, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

const ALLOWED_KEY_PREFIXES = ["outputs/", "inputs/"];

export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const gate = await apiGuard();
  if (gate instanceof NextResponse) return gate;
  if (!r2Configured()) {
    return NextResponse.json({ error: "Object storage is not configured" }, { status: 503 });
  }

  const { key: segments } = await params;
  const key = segments.join("/");
  if (!ALLOWED_KEY_PREFIXES.some((p) => key.startsWith(p)) || key.includes("..")) {
    return NextResponse.json({ error: "Invalid media key" }, { status: 400 });
  }

  const range = req.headers.get("range") ?? undefined;

  try {
    const object = await getFromR2(key, range);
    if (!object.Body) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const headers = new Headers({
      "content-type": object.ContentType ?? "application/octet-stream",
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=31536000, immutable",
    });
    if (object.ContentLength !== undefined) {
      headers.set("content-length", String(object.ContentLength));
    }
    if (object.ContentRange) {
      headers.set("content-range", object.ContentRange);
    }

    return new Response(object.Body.transformToWebStream(), {
      status: object.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NoSuchKey" || name === "NotFound") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
