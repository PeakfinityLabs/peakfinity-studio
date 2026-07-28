import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { MainNav } from "@/components/app/main-nav";
import { SignOutItem } from "@/components/app/sign-out-item";
import { Wordmark } from "@/components/brand/wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";

function initials(nameOrEmail: string): string {
  const name = nameOrEmail.split("@")[0];
  const parts = name.split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Read fresh from the DB, not the JWT — an admin may have just changed status.
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.status !== "APPROVED") redirect("/pending");

  const isAdmin = me.role === "ADMIN";
  const pendingCount = isAdmin ? await prisma.user.count({ where: { status: "PENDING" } }) : 0;
  const displayName = me.name ?? me.email;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4">
          <Wordmark />
          <div className="ml-2">
            <MainNav isAdmin={isAdmin} pendingCount={pendingCount} />
          </div>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button className="flex items-center gap-2 rounded-full border bg-card/60 py-1 pr-3 pl-1 text-sm transition-colors hover:bg-accent">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                      {initials(displayName)}
                    </span>
                    <span className="max-w-32 truncate">{displayName}</span>
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      {me.name}
                      {isAdmin ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">Admin</span>
                      ) : null}
                    </span>
                    {me.jobTitle ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        {me.jobTitle}
                      </span>
                    ) : null}
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {me.email}
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <SignOutItem />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
      <Toaster />
    </div>
  );
}
