"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveStaffAction } from "@/server/actions/people";
import type { StaffRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

export interface StaffValues {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  vendorIds: string[];
  isActive: boolean;
}

export function StaffDialog({
  staff,
  roles,
  vendors,
  isSelf,
}: {
  staff: StaffValues | null;
  roles: StaffRole[];
  /** Laundries the signed-in person may assign: all for a super admin, their own for a laundry admin. */
  vendors: { id: string; nameEn: string; nameAr: string }[];
  isSelf?: boolean;
}) {
  const t = useTranslations("staff");
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    name: staff?.name ?? "",
    email: staff?.email ?? "",
    role: staff?.role ?? roles[roles.length - 1],
    vendorIds: staff?.vendorIds.length ? staff.vendorIds : vendors.slice(0, 1).map((x) => x.id),
    isActive: staff?.isActive ?? true,
    password: "",
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {staff ? (
          <Button variant="ghost" size="iconSm" aria-label={t("edit")}>
            <Pencil aria-hidden />
          </Button>
        ) : (
          <Button variant="stamp">
            <Plus aria-hidden /> {t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={staff ? t("edit") : t("new")} closeLabel={tc("close")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              // A super admin has no laundries; an operator works in exactly one.
              const vendorIds = v.role === "SUPER_ADMIN" ? [] : v.role === "USER" ? v.vendorIds.slice(0, 1) : v.vendorIds;
              const res = await saveStaffAction(staff?.id ?? null, { ...v, vendorIds, password: v.password || undefined });
              if (res.ok) {
                toast.success(staff ? tc("saved") : t("created", { name: v.name }));
                setOpen(false);
                setV((x) => ({ ...x, password: "" }));
              } else toast.error(res.error);
            });
          }}
        >
          <Field label={t("name")} htmlFor="s-name">
            <Input id="s-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={120} />
          </Field>
          <Field label={t("email")} htmlFor="s-email">
            <Input id="s-email" type="email" dir="ltr" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required />
          </Field>
          <fieldset disabled={isSelf}>
            <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{t("role")}</legend>
            <div className="flex flex-col gap-2">
              {roles.map((r) => (
                <label
                  key={r}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2.5",
                    v.role === r ? "border-ink bg-card-recessed" : "border-rule",
                  )}
                >
                  <input type="radio" name="role" className="mt-1 size-4 accent-[var(--stamp)]" checked={v.role === r} onChange={() => setV({ ...v, role: r })} />
                  <span>
                    <span className="block text-sm font-medium">{tr(r)}</span>
                    <span className="block text-[12.5px] text-ink-3">{t(`roleHelp.${r}`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {vendors.length > 1 && v.role === "USER" ? (
            <Field label={t("laundry")} htmlFor="s-vendor">
              <Select id="s-vendor" value={v.vendorIds[0] ?? ""} onChange={(e) => setV({ ...v, vendorIds: [e.target.value] })}>
                {vendors.map((x) => (
                  <option key={x.id} value={x.id}>
                    {locale === "ar" ? x.nameAr : x.nameEn}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {vendors.length > 1 && v.role === "ADMIN" ? (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{t("laundries")}</legend>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-control border border-rule p-1">
                {vendors.map((x) => (
                  <label key={x.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-control px-2 text-sm hover:bg-card-recessed">
                    <input
                      type="checkbox"
                      name="vendorIds"
                      value={x.id}
                      checked={v.vendorIds.includes(x.id)}
                      onChange={(e) =>
                        setV({
                          ...v,
                          vendorIds: e.target.checked ? [...v.vendorIds, x.id] : v.vendorIds.filter((id) => id !== x.id),
                        })
                      }
                      className="size-4 accent-[var(--stamp)]"
                    />
                    {locale === "ar" ? x.nameAr : x.nameEn}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink-3">{t("laundriesHint")}</p>
            </fieldset>
          ) : null}
          <Field label={staff ? t("resetPassword") : t("password")} htmlFor="s-pass" hint={t("passwordHint")}>
            <Input
              id="s-pass"
              type="text"
              autoComplete="new-password"
              dir="ltr"
              value={v.password}
              onChange={(e) => setV({ ...v, password: e.target.value })}
              required={!staff}
              minLength={10}
              placeholder={staff ? tc("optional") : undefined}
            />
          </Field>
          {!isSelf ? (
            <label className="flex items-center justify-between gap-4 rounded-control bg-card-recessed px-3 py-3 text-sm font-medium">
              {t("active")}
              <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />
            </label>
          ) : null}
          <div className="flex justify-end border-t border-rule pt-4">
            <Button type="submit" variant="stamp" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {staff ? tc("saveChanges") : tc("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
