"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "@/app/(auth)/login/actions";

type Field = {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  autoComplete?: string;
};

export function AuthForm({
  title,
  description,
  action,
  fields,
  submitLabel,
  footer,
  callbackUrl,
}: {
  title: string;
  description?: string;
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submitLabel: string;
  footer: { text: string; linkText: string; href: string };
  callbackUrl?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <Card className="w-full max-w-sm border-border/70 shadow-2xl shadow-black/40">
      <CardHeader>
        <CardTitle className="text-display text-xl">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
          {fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                name={field.name}
                type={field.type}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                required
              />
            </div>
          ))}
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : submitLabel}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {footer.text}{" "}
          <Link href={footer.href} className="font-medium text-foreground underline-offset-4 hover:underline">
            {footer.linkText}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
