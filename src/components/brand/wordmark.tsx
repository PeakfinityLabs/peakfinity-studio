import Link from "next/link";
import { cn } from "@/lib/utils";

/** Peakfinity Studio wordmark: a monochrome "P" glyph tile + display type. */
export function Wordmark({
  href = "/studio",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2.5", className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background shadow-sm transition-transform group-hover:scale-105">
        <span className="text-display text-sm leading-none font-bold">P</span>
      </span>
      <span className="text-display text-[0.95rem] leading-none font-semibold tracking-tight">
        Peakfinity <span className="text-muted-foreground">Studio</span>
      </span>
    </Link>
  );
}
