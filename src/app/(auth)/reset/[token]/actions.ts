"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { findValidResetToken } from "@/lib/password-reset";
import type { AuthFormState } from "@/app/(auth)/login/actions";

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  confirm: z.string(),
});

export async function resetAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { token, password, confirm } = parsed.data;
  if (password !== confirm) {
    return { error: "Passwords don't match." };
  }

  const limit = checkRateLimit("reset-attempts", 20, 15 * 60_000);
  if (!limit.allowed) {
    return { error: "Too many attempts — try again shortly." };
  }

  const valid = await findValidResetToken(token);
  if (!valid) {
    return { error: "This reset link is invalid or has expired — request a new one." };
  }

  const passwordHash = await hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: valid.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: valid.id },
      data: { usedAt: new Date() },
    }),
    // Any other outstanding tokens die with the successful reset.
    prisma.passwordResetToken.deleteMany({
      where: { userId: valid.userId, usedAt: null, id: { not: valid.id } },
    }),
  ]);

  try {
    await signIn("credentials", {
      email: valid.user.email,
      password,
      redirectTo: "/studio",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Password updated — sign in with your new password." };
    }
    throw error; // successful sign-in redirects
  }
}
