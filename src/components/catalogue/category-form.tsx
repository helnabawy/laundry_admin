"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCategoryAction, saveCategoryAction } from "@/server/actions/catalogue";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { BilingualInput } from "./bilingual";
import { ImagePicker } from "./image-picker";

export interface CategoryValues {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  iconKey: string;
  imageUrl: string | null;
  isActive: boolean;
}

export function CategoryForm({ category }: { category: CategoryValues | null }) {
  const t = useTranslations("catalogue");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [iconKey, setIconKey] = useState(category?.iconKey ?? "shirt");
  const [active, setActive] = useState(category?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <Sheet>
      <SheetHeader title={category ? t("editCategory") : t("newCategory")} />
      <form
        className="flex flex-col gap-6 px-4 py-5 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          form.set("iconKey", iconKey);
          if (active) form.set("isActive", "on");
          start(async () => {
            const res = await saveCategoryAction(category?.id ?? null, form);
            if (res.ok) {
              setErrors({});
              toast.success(t("created", { name: String(form.get("nameEn")) }));
              if (!category) router.push(`/catalogue/categories/${res.data}`);
            } else {
              setErrors(res.fieldErrors ?? {});
              toast.error(res.error);
            }
          });
        }}
      >
        <BilingualInput
          name="name"
          labelEn={t("nameEn")}
          labelAr={t("nameAr")}
          defaultEn={category?.nameEn}
          defaultAr={category?.nameAr}
          required
          errorEn={errors.nameEn}
          errorAr={errors.nameAr}
        />
        <BilingualInput
          name="description"
          labelEn={t("descriptionEn")}
          labelAr={t("descriptionAr")}
          defaultEn={category?.descriptionEn}
          defaultAr={category?.descriptionAr}
          multiline
        />

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">{t("icon")}</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-control border px-1 py-2.5 text-center text-[11.5px] transition-colors",
                  iconKey === key ? "border-ink bg-card-recessed text-ink" : "border-rule text-ink-2 hover:border-rule-strong",
                )}
              >
                <input type="radio" name="iconKeyChoice" value={key} checked={iconKey === key} onChange={() => setIconKey(key)} className="sr-only" />
                <Icon className="size-5" aria-hidden />
                {t(`iconNames.${key}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label>{t("image")}</Label>
          <ImagePicker current={category?.imageUrl ?? null} />
        </div>

        <label className="flex items-start justify-between gap-4 rounded-control bg-card-recessed px-3 py-3">
          <span>
            <span className="block text-sm font-medium">{t("visible")}</span>
            <span className="block text-[12.5px] text-ink-3">{t("visibleHint")}</span>
          </span>
          <Switch checked={active} onCheckedChange={setActive} aria-label={t("visible")} />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
          {category ? (
            <Button
              type="button"
              variant="dangerOutline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteCategoryAction(category.id);
                  if (res.ok) {
                    toast.success(t("deleted"));
                    router.push("/catalogue");
                  } else toast.error(res.error);
                })
              }
            >
              <Trash2 aria-hidden /> {tc("delete")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="stamp" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {category ? tc("saveChanges") : tc("create")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
