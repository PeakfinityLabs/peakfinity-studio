import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { findOwnProject } from "@/lib/omni-server";
import { OmniWorkspace } from "@/components/omni/omni-workspace";

export const metadata = { title: "Omni project — Peakfinity Studio" };

export default async function OmniProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getSessionUser())!;
  // Projects are private to their owner — anyone else (admins included) gets a 404.
  if (!(await findOwnProject(me, id))) notFound();
  return <OmniWorkspace projectId={id} />;
}
