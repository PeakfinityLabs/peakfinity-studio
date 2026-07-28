import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { JOB_TITLES } from "@/lib/job-titles";

export const runtime = "nodejs";

// null clears the title. Only titles from the curated list are accepted.
const bodySchema = z.object({
  jobTitle: z.enum(JOB_TITLES).nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job title" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Job titles are descriptive only, so admins may set their own too.
  const updated = await prisma.user.update({
    where: { id },
    data: { jobTitle: parsed.data.jobTitle },
    select: { id: true, jobTitle: true },
  });
  return NextResponse.json(updated);
}
