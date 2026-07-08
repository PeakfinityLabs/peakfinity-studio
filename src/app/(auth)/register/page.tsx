import { AuthForm } from "@/components/auth/auth-form";
import { registerAction } from "./actions";

export const metadata = { title: "Register — Peakfinity Studio" };

export default function RegisterPage() {
  return (
    <AuthForm
      title="Create your account"
      description="Anyone can register — an admin approves access before you can generate."
      action={registerAction}
      fields={[
        { name: "name", label: "Name", type: "text", placeholder: "Your name", autoComplete: "name" },
        {
          name: "email",
          label: "Email",
          type: "email",
          placeholder: "you@example.com",
          autoComplete: "email",
        },
        {
          name: "password",
          label: "Password",
          type: "password",
          placeholder: "At least 10 characters",
          autoComplete: "new-password",
        },
      ]}
      submitLabel="Create account"
      footer={{ text: "Already registered?", linkText: "Sign in", href: "/login" }}
    />
  );
}
