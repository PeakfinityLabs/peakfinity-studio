import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { canViewJob } from "@/lib/job-visibility";
import { JobView } from "@/components/jobs/job-view";

export const metadata = { title: "Job — Peakfinity Studio" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getSessionUser())!;
  const job = await prisma.job.findUnique({
    where: { id },
    select: { userId: true, user: { select: { email: true } } },
  });

  // Non-admins may only open their own jobs, and a private-library account's
  // jobs are hidden from everyone else (404 to avoid leaking existence).
  if (!job || !canViewJob(me, { userId: job.userId, ownerEmail: job.user.email })) notFound();

  return <JobView jobId={id} isAdmin={me.role === "ADMIN"} currentUserId={me.id} />;
}
