import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { trackerCaps } from "@/lib/creatives";
import { TrackerView } from "@/components/tracker/tracker-view";

export const metadata = { title: "Creative Tracker — Peakfinity Studio" };

const COPY: Record<string, { heading: string; sub: string }> = {
  admin: {
    heading: "Every creative in flight",
    sub: "Brief, assign and track each concept from scripting through launch.",
  },
  strategist: {
    heading: "Every creative in flight",
    sub: "Brief and track the whole board. Removing a creative is admin-only.",
  },
  editor: {
    heading: "Your creative",
    sub: "Add concepts and drop in your video links as you finish them.",
  },
};

export default async function TrackerPage() {
  const me = (await getSessionUser())!;
  const caps = trackerCaps(me);

  // Assignable people for the editor/strategist pickers.
  const users = caps.canEditAllFields
    ? await prisma.user.findMany({
        where: { status: "APPROVED" },
        select: { id: true, name: true, jobTitle: true },
        orderBy: { name: "asc" },
      })
    : [];

  const copy = COPY[caps.tier];

  return (
    <div className="space-y-6">
      <div>
        <p className="label-mono mb-2">Creative Tracker</p>
        <h1 className="text-display text-3xl">{copy.heading}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.sub}</p>
      </div>
      <TrackerView users={users} />
    </div>
  );
}
