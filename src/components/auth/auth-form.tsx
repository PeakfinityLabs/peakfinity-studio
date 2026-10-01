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
  secondaryLink,
  callbackUrl,
  hidden,
  hideSubmit,
}: {
  title: string;
  description?: string;
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submitLabel: string;
  footer: { text: string; linkText: string; href: string };
  secondaryLink?: { text: string; href: string };
  callbackUrl?: string;
  hidden?: Record<string, string>;
  hideSubmit?: boolean;
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
          {Object.entries(hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
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
          {state.message ? <p className="text-sm text-emerald-400">{state.message}</p> : null}
          {!hideSubmit && (
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Please wait…" : submitLabel}
            </Button>
          )}
        </form>
        {secondaryLink ? (
          <p className="mt-4 text-center text-sm">
            <Link
              href={secondaryLink.href}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {secondaryLink.text}
            </Link>
          </p>
        ) : null}
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
