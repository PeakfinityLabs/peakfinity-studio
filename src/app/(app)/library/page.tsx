import { LibraryView } from "@/components/library/library-view";

export const metadata = { title: "Library — Peakfinity Studio" };

export default function LibraryPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label-mono mb-2">Library</p>
        <h1 className="text-display text-3xl">Everything the team has made</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Filter by model, type, date or editor — re-run or download any generation.
        </p>
      </div>
      <LibraryView />
    </div>
  );
}
