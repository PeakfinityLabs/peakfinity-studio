import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { TrackerView } from "@/components/tracker/tracker-view";

export const metadata = { title: "Creative Tracker — Peakfinity Studio" };

export default async function TrackerPage() {
  const me = (await getSessionUser())!;
  const isAdmin = me.role === "ADMIN";

  // Assignable people for the editor/strategist pickers.
  const users = isAdmin
    ? await prisma.user.findMany({
        where: { status: "APPROVED" },
        select: { id: true, name: true, jobTitle: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <p className="label-mono mb-2">Creative Tracker</p>
        <h1 className="text-display text-3xl">
          {isAdmin ? "Every creative in flight" : "Your assigned creative"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAdmin
            ? "Brief, assign, and track each concept from scripting through launch."
            : "Update status and drop in your video link as you go."}
        </p>
      </div>
      <TrackerView isAdmin={isAdmin} users={users} />
    </div>
  );
}
