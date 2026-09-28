"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveDriverAction } from "@/server/actions/people";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export interface DriverValues {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  isAvailable: boolean;
}

export function DriverDialog({ driver }: { driver: DriverValues | null }) {
  const t = useTranslations("drivers");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    fullName: driver?.fullName ?? "",
    phone: driver?.phone.replace(/^\+971/, "") ?? "",
    isActive: driver?.isActive ?? true,
    isAvailable: driver?.isAvailable ?? true,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {driver ? (
          <Button variant="ghost" size="iconSm" aria-label={t("edit")}>
            <Pencil aria-hidden />
          </Button>
        ) : (
          <Button variant="stamp">
            <Plus aria-hidden /> {t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={driver ? t("edit") : t("new")} closeLabel={tc("close")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveDriverAction(driver?.id ?? null, v);
              if (res.ok) {
                toast.success(driver ? tc("saved") : t("created", { name: v.fullName }));
                setOpen(false);
              } else toast.error(res.error);
            });
          }}
        >
          <Field label={t("name")} htmlFor="d-name">
            <Input id="d-name" value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} required maxLength={120} />
          </Field>
          <Field label={t("phone")} htmlFor="d-phone" hint={t("phoneHint")}>
            <div className="flex" dir="ltr">
              <span className="numerals inline-flex h-10 items-center rounded-s-control border border-e-0 border-rule-strong bg-card-recessed px-3 text-sm text-ink-2">
                +971
              </span>
              <Input
                id="d-phone"
                inputMode="tel"
                className="numerals rounded-s-none"
                value={v.phone}
                onChange={(e) => setV({ ...v, phone: e.target.value })}
                required
              />
            </div>
          </Field>
          <label className="flex items-center justify-between gap-4 rounded-control bg-card-recessed px-3 py-3 text-sm font-medium">
            {t("onShift")}
            <Switch checked={v.isAvailable} onCheckedChange={(c) => setV({ ...v, isAvailable: c })} />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-control bg-card-recessed px-3 py-3 text-sm font-medium">
            {t("active")}
            <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />
          </label>
          <div className="flex justify-end border-t border-rule pt-4">
            <Button type="submit" variant="stamp" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {driver ? tc("saveChanges") : tc("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
