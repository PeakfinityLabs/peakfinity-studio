import Link from "next/link";
import { getSessionUser } from "@/lib/authz";
import { ModelGlyph } from "@/components/studio/model-glyph";
import { OmniHome } from "@/components/omni/omni-home";

export const metadata = { title: "Omni Zone — Peakfinity Studio" };

export default async function OmniPage() {
  const me = (await getSessionUser())!;
  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <ModelGlyph slug="omni-zone" className="h-12 w-12 shrink-0" />
        <div className="min-w-0">
          <p className="label-mono mb-1.5">Workspace</p>
          <h1 className="text-display text-2xl">Omni Zone</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, animate, edit and extend scenes with named avatars, then stitch them into one
            video. The Omni Flash API isn&apos;t connected yet — generation requests are saved, not
            run.
          </p>
        </div>
        <Link
          href="/studio"
          className="ml-auto shrink-0 rounded-full border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← All models
        </Link>
      </div>
      <OmniHome isAdmin={me.role === "ADMIN"} />
    </div>
  );
}
