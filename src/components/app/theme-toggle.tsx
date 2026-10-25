"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "studio-theme";
type Theme = "studio" | "jarvis";

/** Two-way switch between the default Studio theme and the Jarvis HUD theme. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("studio");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "jarvis" ? "jarvis" : "studio");
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    if (next === "jarvis") document.documentElement.dataset.theme = "jarvis";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private mode — theme still applies for this page view
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-full border bg-card/60 p-1"
    >
      {(["studio", "jarvis"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => choose(t)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            theme === t
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t === "studio" ? "Studio" : "Jarvis"}
        </button>
      ))}
    </div>
  );
}
