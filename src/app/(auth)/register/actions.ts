"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/authz";
import { registerSchema } from "@/lib/validators/auth";
import type { AuthFormState } from "@/app/(auth)/login/actions";

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with this email already exists." };
  }

  // Registration is open to anyone. Admin-list emails are provisioned as ADMIN
  // and pre-approved; everyone else lands PENDING and waits for an admin.
  const admin = isAdminEmail(email);
  const passwordHash = await hash(password, 12);
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: admin ? "ADMIN" : "EDITOR",
      status: admin ? "APPROVED" : "PENDING",
      ...(admin ? { reviewedAt: new Date(), reviewedByEmail: "system (admin allowlist)" } : {}),
    },
  });

  // Sign them in regardless of status; the app shell routes PENDING/DENIED users
  // to /pending, so approved admins go straight to the studio.
  try {
    await signIn("credentials", { email, password, redirectTo: admin ? "/studio" : "/pending" });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created — please sign in." };
    }
    throw error;
  }
}
