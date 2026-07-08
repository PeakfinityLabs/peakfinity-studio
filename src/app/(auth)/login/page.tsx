import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "./actions";

export const metadata = { title: "Sign in — Peakfinity Studio" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <AuthForm
      title="Sign in"
      description="Use your Peakfinity Labs account."
      action={loginAction}
      callbackUrl={callbackUrl}
      fields={[
        {
          name: "email",
          label: "Email",
          type: "email",
          placeholder: "you@peakfinitylabs.com",
          autoComplete: "email",
        },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      submitLabel="Sign in"
      footer={{ text: "No account?", linkText: "Register", href: "/register" }}
    />
  );
}
