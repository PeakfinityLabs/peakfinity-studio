import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (req.auth) return NextResponse.next();

  const { nextUrl } = req;
  if (nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", nextUrl);
  loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
  return NextResponse.redirect(loginUrl);
});

// Everything matched here requires a session (login only — approval and admin
// role are enforced in the Node runtime by the app shell and route handlers,
// since middleware runs on the edge and can't reach Prisma). /api/fal/webhook,
// /api/auth/* and /api/health are intentionally NOT matched (fal calls the
// webhook unauthenticated; its requests are verified by signature instead).
export const config = {
  matcher: [
    "/studio/:path*",
    "/library/:path*",
    "/usage/:path*",
    "/jobs/:path*",
    "/admin/:path*",
    "/pending",
    "/api/generate/:path*",
    "/api/jobs/:path*",
    "/api/optimize/:path*",
    "/api/upload/:path*",
    "/api/usage/:path*",
    "/api/media/:path*",
    "/api/admin/:path*",
  ],
};
