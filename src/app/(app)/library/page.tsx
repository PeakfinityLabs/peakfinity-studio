import { getSessionUser } from "@/lib/authz";
import { LibraryView } from "@/components/library/library-view";

export const metadata = { title: "Library — Peakfinity Studio" };

export default async function LibraryPage() {
  const me = (await getSessionUser())!;
  const isAdmin = me.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <p className="label-mono mb-2">Library</p>
        <h1 className="text-display text-3xl">
          {isAdmin ? "Everything the team has made" : "Your generations"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAdmin
            ? "Filter by model, type, date or editor — re-run, download or delete any generation."
            : "Everything you've generated — re-run, download or delete."}
        </p>
      </div>
      <LibraryView isAdmin={isAdmin} currentUserId={me.id} />
    </div>
  );
}
