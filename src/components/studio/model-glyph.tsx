import { cn } from "@/lib/utils";
import type { ModelSlug } from "@/lib/models/registry";

/**
 * Distinct monochrome geometric mark per model, on an elevated tile.
 * Purely decorative — gives each model card a visual identity within the
 * strict black/grey/white system.
 */
export function ModelGlyph({ slug, className }: { slug: ModelSlug; className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-xl border bg-elevated text-foreground",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" aria-hidden>
        {glyphs[slug]}
      </svg>
    </span>
  );
}

const glyphs: Record<ModelSlug, React.ReactNode> = {
  // Nano Banana 2 — concentric aperture
  "nano-banana-2": (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.4" fill="currentColor" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  // GPT Image 2 — stacked frames
  "gpt-image-2": (
    <>
      <rect x="4" y="4" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="9" width="11" height="11" rx="2" fill="var(--card)" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12.5 15.5l2-2.2 2 2.2 1.5-1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Kling O3 — play triangle in motion
  "kling-o3": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" />
      <path d="M3 8.5h18" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    </>
  ),
  // Seedance 2.0 — layered reference streams
  "seedance-2": (
    <>
      <path d="M4 8c4-3 12-3 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 12c4-3 12-3 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <path d="M4 16c4-3 12-3 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
      <circle cx="12" cy="10.5" r="1.6" fill="currentColor" />
    </>
  ),
};
