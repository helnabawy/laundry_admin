"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changePasswordAction, updateProfileAction } from "@/server/actions/people";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function ProfileName({ name }: { name: string }) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateProfileAction({ name: value });
          if (res.ok) toast.success(tc("saved"));
          else toast.error(res.error);
        });
      }}
    >
      <Field label={t("name")} htmlFor="p-name" className="flex-1">
        <Input id="p-name" value={value} onChange={(e) => setValue(e.target.value)} required maxLength={120} />
      </Field>
      <Button type="submit" variant="outline" disabled={pending || value.trim() === name}>
        {tc("save")}
      </Button>
    </form>
  );
}

export function ChangePassword() {
  const t = useTranslations("profile");
  const [v, setV] = useState({ current: "", next: "" });
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await changePasswordAction(v);
          if (res.ok) {
            toast.success(t("passwordChanged"));
            setV({ current: "", next: "" });
          } else toast.error(res.error);
        });
      }}
    >
      <Field label={t("currentPassword")} htmlFor="p-cur">
        <Input id="p-cur" type="password" autoComplete="current-password" dir="ltr" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} required />
      </Field>
      <Field label={t("newPassword")} htmlFor="p-new" hint={t("newPasswordHint")}>
        <Input id="p-new" type="password" autoComplete="new-password" dir="ltr" minLength={10} value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} required />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="stamp" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("changePassword")}
        </Button>
      </div>
    </form>
  );
}
