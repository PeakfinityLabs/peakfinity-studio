import { LibraryView } from "@/components/library/library-view";

export const metadata = { title: "Library — Peakfinity Studio" };

export default function LibraryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every generation from the team — filter, re-run, download.
        </p>
      </div>
      <LibraryView />
    </div>
  );
}
