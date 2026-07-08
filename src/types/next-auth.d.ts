import type { DefaultSession } from "next-auth";
import "next-auth/jwt";

export type UserRole = "EDITOR" | "ADMIN";
export type UserAccountStatus = "PENDING" | "APPROVED" | "DENIED";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      status: UserAccountStatus;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    status: UserAccountStatus;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    status: UserAccountStatus;
  }
}
