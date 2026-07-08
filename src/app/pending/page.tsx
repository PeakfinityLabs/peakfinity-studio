import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getSessionUser } from "@/lib/authz";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PendingPoller } from "@/components/auth/pending-poller";

export const metadata = { title: "Pending approval — Peakfinity Studio" };

export default async function PendingPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.status === "APPROVED") redirect("/studio");

  const denied = me.status === "DENIED";

  return (
    <div className="glow-hero relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,oklch(1_0_0/0.06),transparent_55%)]" />
      {!denied && <PendingPoller />}
      <div className="relative flex w-full max-w-md flex-col items-center">
        <div className="mb-8">
          <Wordmark href="/pending" />
        </div>
        <Card className="w-full border-border/70 shadow-2xl shadow-black/40">
          <CardContent className="space-y-4 pt-6 text-center">
            <p className="label-mono">{denied ? "Access denied" : "Awaiting approval"}</p>
            <h1 className="text-display text-2xl">
              {denied ? "Your request was declined" : "You're on the list"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {denied ? (
                <>
                  An admin declined access for <span className="font-mono">{me.email}</span>. If you
                  think this is a mistake, reach out to the Peakfinity Labs team.
                </>
              ) : (
                <>
                  Your account (<span className="font-mono">{me.email}</span>) is waiting for an
                  admin to approve it. This page updates automatically the moment you are approved
                  — no need to refresh.
                </>
              )}
            </p>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <p className="relative mt-10 text-xs text-muted-foreground">Internal tool · Peakfinity Labs</p>
    </div>
  );
}
