"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { createResetToken, maybeSendResetEmail } from "@/lib/password-reset";
import type { AuthFormState } from "@/app/(auth)/login/actions";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

/**
 * Self-serve reset request. Never reveals whether the email has an account.
 * With an email service configured the link is emailed directly; otherwise
 * the request surfaces in the Admin panel and an admin sends a link.
 */
export async function forgotAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }
  const email = parsed.data.email;

  const limit = checkRateLimit(`forgot:${email}`, 3, 15 * 60_000);
  if (!limit.allowed) {
    return { error: `Too many requests — try again in ${limit.retryAfterSeconds}s.` };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const { url } = await createResetToken(user.id, "user");
    const emailed = await maybeSendResetEmail(email, url);
    if (emailed) {
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { emailed: true },
      });
    }
  }

  return {
    message:
      "Request received. If that account exists, a reset link is on its way — the admins have been notified, so expect it shortly (check with Rahul or Alex if you're in a hurry).",
  };
}
