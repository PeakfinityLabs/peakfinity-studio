import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import { ensureAdminForEmail, isAdminEmail } from "@/lib/authz";
import { loginSchema } from "@/lib/validators/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const passwordMatches = await compare(password, user.passwordHash);
        if (!passwordMatches) return null;

        // Self-heal admins on login (e.g. a pre-existing account whose email was
        // later added to ADMIN_EMAILS). Login succeeds for any status; approval
        // is enforced by the app shell + API routes, not here.
        await ensureAdminForEmail(user.id, user.email);
        const isAdmin = isAdminEmail(user.email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: isAdmin ? "ADMIN" : user.role,
          status: isAdmin ? "APPROVED" : user.status,
        };
      },
    }),
  ],
});
