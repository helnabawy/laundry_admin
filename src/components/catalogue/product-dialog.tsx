"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProductAction, saveProductAction, toggleProductAction } from "@/server/actions/catalogue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Label, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { pick } from "@/lib/format";
import { BilingualInput } from "./bilingual";
import { ImagePicker } from "./image-picker";

export interface ProductValues {
  id: string;
  categoryId: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  unitPrice: number;
  imageUrl: string | null;
  isActive: boolean;
}

type CategoryOption = { id: string; nameEn: string; nameAr: string };

export function ProductDialog({
  product,
  categories,
  defaultCategoryId,
}: {
  product: ProductValues | null;
  categories: CategoryOption[];
  defaultCategoryId?: string;
}) {
  const t = useTranslations("catalogue");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(product?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {product ? (
          <Button variant="ghost" size="iconSm" aria-label={t("editProduct")}>
            <Pencil aria-hidden />
          </Button>
        ) : (
          <Button variant="stamp">
            <Plus aria-hidden /> {t("addProduct")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={product ? t("editProduct") : t("newProduct")} closeLabel={tc("close")} wide>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            if (active) form.set("isActive", "on");
            start(async () => {
              const res = await saveProductAction(product?.id ?? null, form);
              if (res.ok) {
                toast.success(t("created", { name: pick(locale, String(form.get("nameEn")), String(form.get("nameAr"))) }));
                setErrors({});
                setOpen(false);
              } else {
                setErrors(res.fieldErrors ?? {});
                toast.error(res.error);
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("category")} htmlFor="categoryId">
              <Select id="categoryId" name="categoryId" defaultValue={product?.categoryId ?? defaultCategoryId ?? categories[0]?.id}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {pick(locale, c.nameEn, c.nameAr)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("price")} htmlFor="unitPrice" error={errors.unitPrice}>
              <Input
                id="unitPrice"
                name="unitPrice"
                inputMode="decimal"
                dir="ltr"
                className="numerals"
                defaultValue={product?.unitPrice ?? ""}
                required
                aria-invalid={errors.unitPrice ? true : undefined}
              />
            </Field>
          </div>
          <BilingualInput
            name="name"
            labelEn={t("nameEn")}
            labelAr={t("nameAr")}
            defaultEn={product?.nameEn}
            defaultAr={product?.nameAr}
            required
            errorEn={errors.nameEn}
            errorAr={errors.nameAr}
          />
          <BilingualInput
            name="description"
            labelEn={t("descriptionEn")}
            labelAr={t("descriptionAr")}
            defaultEn={product?.descriptionEn}
            defaultAr={product?.descriptionAr}
          />
          <div className="flex flex-col gap-2">
            <Label>{t("image")}</Label>
            <ImagePicker current={product?.imageUrl ?? null} />
          </div>
          <label className="flex items-center justify-between gap-4 rounded-control bg-card-recessed px-3 py-3">
            <span className="text-sm font-medium">{t("visible")}</span>
            <Switch checked={active} onCheckedChange={setActive} aria-label={t("visible")} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
            {product ? (
              <Button
                type="button"
                variant="dangerOutline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await deleteProductAction(product.id);
                    if (res.ok) {
                      toast.success(t("deleted"));
                      setOpen(false);
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
              {product ? tc("saveChanges") : tc("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductVisibility({ id, isActive, label }: { id: string; isActive: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState(isActive);
  return (
    <Switch
      checked={checked}
      disabled={pending}
      aria-label={label}
      onCheckedChange={(c) => {
        setChecked(c);
        start(async () => {
          const res = await toggleProductAction(id, c);
          if (!res.ok) {
            setChecked(!c);
            toast.error(res.error);
          }
        });
      }}
    />
  );
}
