import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    // Render injects the deployed commit — makes "is my push live yet?"
    // answerable without auth. Absent in local dev.
    commit: process.env.RENDER_GIT_COMMIT ?? null,
  });
}
