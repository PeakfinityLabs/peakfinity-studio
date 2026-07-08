"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type AuthFormState = { error?: string };

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const callbackUrl = formData.get("callbackUrl");
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: typeof callbackUrl === "string" && callbackUrl ? callbackUrl : "/studio",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error; // successful sign-in throws a redirect — let it propagate
  }
}
