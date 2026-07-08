"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const baseLinks = [
  { href: "/studio", label: "Studio" },
  { href: "/library", label: "Library" },
  { href: "/usage", label: "Usage" },
];

export function MainNav({
  isAdmin = false,
  pendingCount = 0,
}: {
  isAdmin?: boolean;
  pendingCount?: number;
}) {
  const pathname = usePathname();
  const links = isAdmin ? [...baseLinks, { href: "/admin", label: "Admin" }] : baseLinks;

  return (
    <nav className="flex items-center gap-0.5 rounded-full border bg-card/60 p-1">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const showBadge = link.href === "/admin" && pendingCount > 0;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
            {showBadge && (
              <span
                className={cn(
                  "flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none",
                  active ? "bg-background/20 text-background" : "bg-foreground text-background"
                )}
              >
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
