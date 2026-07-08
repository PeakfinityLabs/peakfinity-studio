import { Wordmark } from "@/components/brand/wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="glow-hero relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,oklch(1_0_0/0.06),transparent_55%)]" />
      <div className="relative flex w-full max-w-sm flex-col items-center">
        <div className="mb-10 flex flex-col items-center gap-4">
          <Wordmark href="/login" />
          <p className="label-mono">Ad-creative generation</p>
        </div>
        {children}
      </div>
      <p className="relative mt-10 text-xs text-muted-foreground">
        Internal tool · Peakfinity Labs
      </p>
    </div>
  );
}
