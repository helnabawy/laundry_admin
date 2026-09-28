"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EyeOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSubServiceAction, saveSubServiceAction } from "@/server/actions/catalogue";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { pick } from "@/lib/format";

interface Sub {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  isActive: boolean;
}

export function SubServices({ categoryId, items }: { categoryId: string; items: Sub[] }) {
  const t = useTranslations("catalogue");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();

  return (
    <Sheet>
      <SheetHeader
        title={t("subServices")}
        actions={
          <Button variant="outline" size="sm" onClick={() => setEditing("new")} disabled={editing === "new"}>
            <Plus aria-hidden /> {t("addSubService")}
          </Button>
        }
      />
      <p className="border-b border-rule px-4 py-3 text-[13px] text-ink-2 sm:px-5">{t("subServicesHint")}</p>
      <ul className="divide-y divide-rule">
        {items.length === 0 && editing !== "new" ? (
          <li className="px-4 py-5 text-sm text-ink-3 sm:px-5">{t("noSubServices")}</li>
        ) : null}
        {items.map((s) =>
          editing === s.id ? (
            <li key={s.id}>
              <SubForm categoryId={categoryId} sub={s} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{pick(locale, s.nameEn, s.nameAr)}</p>
                <p className="truncate text-[13px] text-ink-3">{pick(locale, s.descriptionEn, s.descriptionAr)}</p>
              </div>
              {!s.isActive ? <EyeOff className="size-4 text-ink-3" aria-label={t("hidden")} /> : null}
              <Button variant="ghost" size="iconSm" onClick={() => setEditing(s.id)} aria-label={tc("edit")}>
                <Pencil aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                disabled={pending}
                aria-label={tc("delete")}
                onClick={() =>
                  start(async () => {
                    const res = await deleteSubServiceAction(s.id);
                    if (res.ok) toast.success(t("deleted"));
                    else toast.error(res.error);
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ),
        )}
        {editing === "new" ? (
          <li>
            <SubForm categoryId={categoryId} sub={null} onDone={() => setEditing(null)} />
          </li>
        ) : null}
      </ul>
    </Sheet>
  );
}

function SubForm({ categoryId, sub, onDone }: { categoryId: string; sub: Sub | null; onDone: () => void }) {
  const t = useTranslations("catalogue");
  const tc = useTranslations("common");
  const [v, setV] = useState({
    nameEn: sub?.nameEn ?? "",
    nameAr: sub?.nameAr ?? "",
    descriptionEn: sub?.descriptionEn ?? "",
    descriptionAr: sub?.descriptionAr ?? "",
    isActive: sub?.isActive ?? true,
  });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="flex flex-col gap-3 bg-card-recessed px-4 py-4 sm:px-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveSubServiceAction(categoryId, sub?.id ?? null, v);
          if (res.ok) {
            toast.success(t("created", { name: v.nameEn }));
            onDone();
          } else toast.error(res.error);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("nameEn")}>
          <Input value={v.nameEn} onChange={set("nameEn")} dir="ltr" required maxLength={120} />
        </Field>
        <Field label={t("nameAr")}>
          <Input value={v.nameAr} onChange={set("nameAr")} dir="rtl" lang="ar" required maxLength={120} />
        </Field>
        <Field label={t("descriptionEn")}>
          <Input value={v.descriptionEn} onChange={set("descriptionEn")} dir="ltr" maxLength={400} />
        </Field>
        <Field label={t("descriptionAr")}>
          <Input value={v.descriptionAr} onChange={set("descriptionAr")} dir="rtl" lang="ar" maxLength={400} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />
          {t("visible")}
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {tc("cancel")}
          </Button>
          <Button type="submit" variant="stamp" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {tc("save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
