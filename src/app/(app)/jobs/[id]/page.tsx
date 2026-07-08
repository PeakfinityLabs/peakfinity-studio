import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { JobView } from "@/components/jobs/job-view";

export const metadata = { title: "Job — Peakfinity Studio" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exists = await prisma.job.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();
  return <JobView jobId={id} />;
}
