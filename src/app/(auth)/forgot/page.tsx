import { AuthForm } from "@/components/auth/auth-form";
import { forgotAction } from "./actions";

export const metadata = { title: "Forgot password — Peakfinity Studio" };

export default function ForgotPage() {
  return (
    <AuthForm
      title="Forgot password"
      description="Tell us your account email and we'll get you a reset link."
      action={forgotAction}
      fields={[
        {
          name: "email",
          label: "Email",
          type: "email",
          placeholder: "you@example.com",
          autoComplete: "email",
        },
      ]}
      submitLabel="Request reset link"
      footer={{ text: "Remembered it?", linkText: "Back to sign in", href: "/login" }}
    />
  );
}
