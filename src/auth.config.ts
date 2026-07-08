import type { NextAuthConfig } from "next-auth";

// Edge-safe Auth.js config: imported by middleware, so it must not touch Prisma
// or any Node-only module. The Credentials provider lives in src/auth.ts.
// Credentials auth requires JWT sessions (database sessions are unsupported for it).
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? "";
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
