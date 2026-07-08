import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
});

export function allowedEmailDomain(): string {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "peakfinitylabs.com").toLowerCase();
}

export function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${allowedEmailDomain()}`);
}
