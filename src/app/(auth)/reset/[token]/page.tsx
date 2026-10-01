import { AuthForm } from "@/components/auth/auth-form";
import { findValidResetToken } from "@/lib/password-reset";
import { resetAction } from "./actions";

export const metadata = { title: "Reset password — Peakfinity Studio" };

export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Pre-check so a dead link explains itself instead of failing on submit.
  const valid = await findValidResetToken(token);

  if (!valid) {
    return (
      <AuthForm
        title="Reset link expired"
        description="This reset link is invalid, already used, or older than an hour."
        action={async (state) => {
          "use server";
          return state;
        }}
        fields={[]}
        submitLabel="—"
        hideSubmit
        footer={{ text: "Need a new one?", linkText: "Request a reset", href: "/forgot" }}
      />
    );
  }

  return (
    <AuthForm
      title="Choose a new password"
      description={`Resetting the password for ${valid.user.email}.`}
      action={resetAction}
      hidden={{ token }}
      fields={[
        {
          name: "password",
          label: "New password",
          type: "password",
          placeholder: "At least 10 characters",
          autoComplete: "new-password",
        },
        {
          name: "confirm",
          label: "Confirm new password",
          type: "password",
          autoComplete: "new-password",
        },
      ]}
      submitLabel="Set password & sign in"
      footer={{ text: "Changed your mind?", linkText: "Back to sign in", href: "/login" }}
    />
  );
}
