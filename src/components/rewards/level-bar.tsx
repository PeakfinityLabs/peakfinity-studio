import Link from "next/link";
import type { Progress } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/** Metal per tier: medallion + bar gradient. */
const TIER: Record<string, { from: string; to: string; glow: string }> = {
  Bronze: { from: "#e2a46a", to: "#a5622c", glow: "rgb(205 127 50 / 0.45)" },
  Silver: { from: "#f1f5f9", to: "#94a3b8", glow: "rgb(203 213 225 / 0.4)" },
  Gold: { from: "#fde68a", to: "#d97706", glow: "rgb(251 191 36 / 0.45)" },
  Platinum: { from: "#cffafe", to: "#22d3ee", glow: "rgb(34 211 238 / 0.45)" },
  Legend: { from: "#f5d0fe", to: "#8b5cf6", glow: "rgb(167 139 250 / 0.55)" },
};

/**
 * Compact level/XP pill shown under the nav bar. Server-rendered (no client
 * JS); the whole pill links to the Point Store when the viewer can open it.
 */
export function LevelBar({ progress, href }: { progress: Progress; href?: string }) {
  const { level, tier, prestige, into, needed, pct, canPrestige, points, nextReward } = progress;
  const metal = TIER[tier] ?? TIER.Bronze;
  const gradient = `linear-gradient(135deg, ${metal.from}, ${metal.to})`;
  const label = canPrestige
    ? `Level ${level}, max level — prestige available. ${points} points.`
    : `Level ${level} ${tier}, ${into} of ${needed} approvals to level ${level + 1}. ${points} points.`;

  const body = (
    <>
      <span
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold text-black/80 tabular-nums ring-1 ring-white/20 ring-inset"
        style={{ background: gradient, boxShadow: `0 0 14px -3px ${metal.glow}` }}
        aria-hidden
      >
        {level}
        {prestige > 0 && (
          <span className="absolute -top-1.5 -right-2 rounded-full border border-background bg-foreground px-1 font-mono text-[9px] leading-[14px] font-semibold text-background">
            P{prestige}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-col gap-1.5" aria-hidden>
        <span className="flex items-baseline justify-between gap-3 text-xs leading-none">
          <span className="font-medium text-foreground">
            Lv {level} <span className="text-muted-foreground">· {tier}</span>
          </span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {canPrestige ? "MAX" : `${into}/${needed} XP`}
          </span>
        </span>
        <span className="relative block h-1.5 w-40 overflow-hidden rounded-full bg-foreground/10 ring-1 ring-foreground/5 sm:w-48">
          <span
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
            style={{
              width: `${pct > 0 ? Math.max(pct, 4) : 0}%`,
              background: `linear-gradient(90deg, ${metal.to}, ${metal.from})`,
            }}
          />
        </span>
      </span>

      <span className="h-7 w-px bg-border" aria-hidden />

      <span className="flex flex-col items-end leading-none" aria-hidden>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {points.toLocaleString()}
        </span>
        <span className="mt-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          pts
        </span>
      </span>
    </>
  );

  const cls =
    "group flex items-center gap-3 rounded-full border border-border/70 bg-card/60 py-1.5 pr-4 pl-1.5 shadow-sm backdrop-blur-xl transition-colors";
  const title = canPrestige ? "Max level — prestige available" : `Next level: +${nextReward} pts`;

  return (
    <div className="mx-auto flex w-full max-w-6xl justify-end px-4 pt-4">
      {href ? (
        <Link
          href={href}
          aria-label={label}
          title={title}
          className={cn(cls, "hover:border-foreground/25 hover:bg-card")}
        >
          {body}
        </Link>
      ) : (
        <div role="status" aria-label={label} title={title} className={cls}>
          {body}
        </div>
      )}
    </div>
  );
}
