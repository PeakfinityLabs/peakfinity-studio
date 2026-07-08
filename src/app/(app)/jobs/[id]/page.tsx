import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { JobView } from "@/components/jobs/job-view";

export const metadata = { title: "Job — Peakfinity Studio" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getSessionUser())!;
  const job = await prisma.job.findUnique({ where: { id }, select: { userId: true } });

  // Non-admins may only open their own jobs (404 to avoid leaking existence).
  if (!job || (me.role !== "ADMIN" && job.userId !== me.id)) notFound();

  return <JobView jobId={id} isAdmin={me.role === "ADMIN"} currentUserId={me.id} />;
}
