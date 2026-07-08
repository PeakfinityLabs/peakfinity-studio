"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/studio", label: "Studio" },
  { href: "/library", label: "Library" },
  { href: "/usage", label: "Usage" },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5 rounded-full border bg-card/60 p-1">
      {navLinks.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
