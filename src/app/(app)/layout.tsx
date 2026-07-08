import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { MainNav } from "@/components/app/main-nav";
import { Wordmark } from "@/components/brand/wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const session = await auth();
  if (!session?.user) redirect("/login");

  const displayName = session.user.name ?? session.user.email ?? "Account";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4">
          <Wordmark />
          <div className="ml-2">
            <MainNav />
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
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="font-medium">{session.user.name ?? "Editor"}</span>
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {session.user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <DropdownMenuItem render={<button type="submit" className="w-full" />}>
                    Sign out
                  </DropdownMenuItem>
                </form>
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
