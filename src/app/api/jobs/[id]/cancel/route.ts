import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fal } from "@/lib/fal/client";
import { canViewJob } from "@/lib/job-visibility";
import { parseJobInput } from "@/lib/jobs/types";
import { cancelJob, isOmnirouterEndpoint, modelFromEndpoint, serverOf } from "@/lib/omnirouter";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  // Same visibility rule as GET: own jobs always, others only if the owner is
  // not a private-library account.
  if (!canViewJob(me, { userId: job.userId, ownerEmail: job.user.email })) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "IN_QUEUE" && job.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 409 });
  }

  const { endpoint: jobEndpoint, params: jobParams } = parseJobInput(job.input);
  if (job.falRequestId && isOmnirouterEndpoint(jobEndpoint)) {
    try {
      await cancelJob(modelFromEndpoint(jobEndpoint), job.falRequestId, serverOf(jobParams));
    } catch {
      return NextResponse.json(
        { error: "The provider could not cancel this job (it may already be running)" },
        { status: 409 }
      );
    }
  } else if (job.falRequestId) {
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
