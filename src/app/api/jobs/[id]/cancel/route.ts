import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { fal } from "@/lib/fal/client";
import { parseJobInput } from "@/lib/jobs/types";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "You can only cancel your own jobs" }, { status: 403 });
  }
  if (job.status !== "IN_QUEUE" && job.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 409 });
  }

  if (job.falRequestId) {
    const { endpoint } = parseJobInput(job.input);
    try {
      await fal.queue.cancel(endpoint, { requestId: job.falRequestId });
    } catch {
      // Cancellation is best-effort: fal rejects cancels for jobs already
      // running/finished. The webhook/poller will settle the real status.
      return NextResponse.json(
        { error: "fal could not cancel this job (it may already be running)" },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.job.updateMany({
    where: { id, status: { in: ["IN_QUEUE", "IN_PROGRESS"] } },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  return NextResponse.json({ cancelled: updated.count === 1 });
}
