"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { login, type LoginState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label={t("email")} htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          dir="ltr"
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          autoFocus
        />
      </Field>
      <Field label={t("password")} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      {state.error ? (
        <p role="alert" className="rounded-control bg-danger-wash px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="stamp" size="lg" disabled={pending} className="mt-1">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("signIn")}
        {pending ? null : <ArrowRight className="flip-rtl" aria-hidden />}
      </Button>
    </form>
  );
}
