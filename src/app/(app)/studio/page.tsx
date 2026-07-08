import Link from "next/link";
import { ModelGlyph } from "@/components/studio/model-glyph";
import { MODEL_SLUGS, MODELS } from "@/lib/models/registry";

export const metadata = { title: "Studio — Peakfinity Studio" };

export default function StudioPage() {
  return (
    <div className="space-y-10">
      <header className="glow-hero relative">
        <p className="label-mono mb-3">Studio</p>
        <h1 className="text-display max-w-2xl text-4xl leading-[1.05] sm:text-5xl">
          Generate ad creative.
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Pick a model to start. Every generation runs on fal.ai — write a prompt, tune the
          parameters, and watch the cost before you commit.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {MODEL_SLUGS.map((slug) => {
          const def = MODELS[slug];
          return (
            <Link key={slug} href={`/studio/${slug}`} className="group">
              <div className="lift relative flex h-full flex-col gap-5 overflow-hidden rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between">
                  <ModelGlyph slug={slug} className="h-12 w-12" />
                  <span className="label-mono border-b border-transparent pt-1">
                    {def.type === "VIDEO" ? "Video" : "Image"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-display text-lg tracking-tight">{def.label}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">{def.tagline}</p>
                </div>
                <div className="mt-auto flex items-center gap-3 border-t border-border/60 pt-4">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {def.costNote}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                    Open →
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
