"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-runs the /pending server component every few seconds; once the admin
// approves the account, that server component redirects to /studio.
export function PendingPoller({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
