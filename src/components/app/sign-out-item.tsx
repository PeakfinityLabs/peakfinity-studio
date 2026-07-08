"use client";

import { signOut } from "next-auth/react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

// Base UI menu items are selected via onClick, not nested <form> submits.
// next-auth's client signOut handles the CSRF POST + redirect.
export function SignOutItem() {
  return (
    <DropdownMenuItem
      variant="destructive"
      onClick={() => void signOut({ callbackUrl: "/login" })}
    >
      Sign out
    </DropdownMenuItem>
  );
}
