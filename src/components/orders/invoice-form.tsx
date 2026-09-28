"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Camera, Loader2, Minus, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { issueInvoiceAction, uploadConditionPhotoAction } from "@/server/actions/orders";
import { invoiceTotals, type SurchargeType } from "@/domain/pricing";
import { isolate, money, pick } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

interface ProductOption {
  id: string;
  nameEn: string;
  nameAr: string;
  unitPrice: number;
}

interface CustomLine {
  key: string;
  nameEn: string;
  nameAr: string;
  quantity: number;
  unitPrice: number;
}

interface Finding {
  key: string;
  itemName: string;
  kind: "stain" | "damage";
  note: string;
  photoUrl?: string;
  uploading?: boolean;
}

let seq = 0;
const nextKey = () => `k${++seq}`;

/**
 * Count & invoice (wizard orders). The laundry counts what arrived, prices it
 * from the catalogue, records the condition report, and sees exactly what the
 * customer will see before issuing.
 */
export function InvoiceForm({
  order,
  tier,
  codFee,
  categories,
}: {
  order: {
    id: string;
    number: number;
    customerName: string;
    requested: { category: { en: string; ar: string }; subService: { en: string; ar: string } }[];
    requestedCategoryIds: string[];
  };
  tier: { nameEn: string; nameAr: string; isVip: boolean; surchargeType: SurchargeType; surchargeValue: number };
  codFee: number;
  categories: { id: string; nameEn: string; nameAr: string; products: ProductOption[] }[];
}) {
  const t = useTranslations("invoiceForm");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [custom, setCustom] = useState<CustomLine[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [noFindings, setNoFindings] = useState(false);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [activeCategory, setActiveCategory] = useState(
    categories.find((c) => order.requestedCategoryIds.includes(c.id))?.id ?? categories[0]?.id,
  );
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const products = useMemo(() => new Map(categories.flatMap((c) => c.products.map((p) => [p.id, p]))), [categories]);

  const lines = [
    ...Object.entries(counts)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => {
        const p = products.get(id)!;
        return { key: id, name: pick(locale, p.nameEn, p.nameAr), quantity, unitPrice: p.unitPrice };
      }),
    ...custom
      .filter((c) => (c.nameEn || c.nameAr) && c.quantity > 0)
      .map((c) => ({ key: c.key, name: pick(locale, c.nameEn, c.nameAr), quantity: c.quantity, unitPrice: c.unitPrice })),
  ];
  const totals = invoiceTotals({ lines, tier, paymentMethod: null, vendorCodFee: codFee });
  const pieces = lines.reduce((s, l) => s + l.quantity, 0);
  const conditionReady = findings.length > 0 ? findings.every((f) => f.itemName.trim()) : noFindings;
  const customValid = custom.every((c) => !c.nameEn && !c.nameAr ? true : c.nameEn.trim() && c.nameAr.trim() && c.unitPrice >= 0);
  const ready = lines.length > 0 && conditionReady && customValid && !findings.some((f) => f.uploading);

  const setCount = (id: string, value: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(999, Math.round(value) || 0)) }));

  const upload = async (key: string, file: File) => {
    setFindings((fs) => fs.map((f) => (f.key === key ? { ...f, uploading: true } : f)));
    const form = new FormData();
    form.set("file", file);
    const res = await uploadConditionPhotoAction(form);
    setFindings((fs) =>
      fs.map((f) => (f.key === key ? { ...f, uploading: false, photoUrl: res.ok ? (res.data as string) : f.photoUrl } : f)),
    );
    if (!res.ok) toast.error(res.error);
  };

  const submit = () => {
    setConfirming(false);
    start(async () => {
      const res = await issueInvoiceAction(order.id, {
        items: [
          ...Object.entries(counts)
            .filter(([, q]) => q > 0)
            .map(([productId, quantity]) => ({ productId, quantity })),
          ...custom
            .filter((c) => c.nameEn || c.nameAr)
            .map((c) => ({ nameEn: c.nameEn.trim(), nameAr: c.nameAr.trim(), quantity: c.quantity, unitPrice: c.unitPrice })),
        ],
        conditions: findings.map((f) => ({
          itemName: f.itemName.trim(),
          kind: f.kind,
          note: f.note.trim() || undefined,
          photoUrl: f.photoUrl,
        })),
        noFindingsConfirmed: findings.length === 0 && noFindings,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        toast.success(t("issued", { number: order.number }));
        router.push(`/orders/${order.id}`);
      } else toast.error(res.error);
    });
  };

  const current = categories.find((c) => c.id === activeCategory);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/orders/${order.id}`} className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="flip-rtl size-4" aria-hidden />
        {t("backToOrder", { number: order.number })}
      </Link>
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.015em]">
          {t("title")} · <span className="numerals">{order.number}</span>
        </h1>
        <p className="mt-1.5 text-sm text-ink-2">
          {t("requestedWas")}{" "}
          {order.requested
            .map((r) => `${pick(locale, r.category.en, r.category.ar)} (${pick(locale, r.subService.en, r.subService.ar)})`)
            .join("، ")}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* 1 · Count */}
          <Sheet aria-labelledby="count-title">
            <SheetHeader title={<span id="count-title">{t("countTitle")}</span>} />
            <div className="flex gap-2 overflow-x-auto border-b border-rule px-4 py-2.5 sm:px-5" role="tablist" aria-label={t("categories")}>
              {categories.map((c) => {
                const inCat = c.products.reduce((s, p) => s + (counts[p.id] ?? 0), 0);
                return (
                  <button
                    key={c.id}
                    role="tab"
                    aria-selected={c.id === activeCategory}
                    onClick={() => setActiveCategory(c.id)}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-2 rounded-control px-3 text-sm font-medium",
                      c.id === activeCategory ? "bg-stamp text-on-stamp" : "text-ink-2 hover:bg-card-recessed",
                    )}
                  >
                    {pick(locale, c.nameEn, c.nameAr)}
                    {inCat > 0 ? <span className="numerals text-[12px] opacity-80">{inCat}</span> : null}
                  </button>
                );
              })}
            </div>
            <ul className="divide-y divide-rule" role="tabpanel">
              {current?.products.map((p) => {
                const q = counts[p.id] ?? 0;
                return (
                  <li key={p.id} className={cn("flex items-center gap-3 px-4 py-2.5 sm:px-5", q > 0 && "bg-canary-wash/50")}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{pick(locale, p.nameEn, p.nameAr)}</p>
                      <p className="numerals text-[12.5px] text-ink-3">{money(locale, p.unitPrice)}</p>
                    </div>
                    <div className="flex items-center gap-1" role="group" aria-label={pick(locale, p.nameEn, p.nameAr)}>
                      <Button variant="outline" size="icon" disabled={q === 0} onClick={() => setCount(p.id, q - 1)} aria-label={t("decrease")}>
                        <Minus aria-hidden />
                      </Button>
                      <input
                        inputMode="numeric"
                        value={q}
                        onChange={(e) => setCount(p.id, Number(e.target.value.replace(/\D/g, "")))}
                        onFocus={(e) => e.target.select()}
                        aria-label={t("quantityOf", { item: pick(locale, p.nameEn, p.nameAr) })}
                        className="numerals h-10 w-14 rounded-control border border-rule-strong bg-card text-center text-[15px] font-semibold focus-visible:border-focus focus-visible:outline-none"
                      />
                      <Button variant="outline" size="icon" onClick={() => setCount(p.id, q + 1)} aria-label={t("increase")}>
                        <Plus aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-rule px-4 py-3 sm:px-5">
              {custom.map((c) => (
                <div key={c.key} className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_5rem_6rem_auto]">
                  <Input
                    placeholder={t("customNameEn")}
                    aria-label={t("customNameEn")}
                    value={c.nameEn}
                    dir="ltr"
                    onChange={(e) => setCustom((xs) => xs.map((x) => (x.key === c.key ? { ...x, nameEn: e.target.value } : x)))}
                  />
                  <Input
                    placeholder={t("customNameAr")}
                    aria-label={t("customNameAr")}
                    value={c.nameAr}
                    dir="rtl"
                    lang="ar"
                    onChange={(e) => setCustom((xs) => xs.map((x) => (x.key === c.key ? { ...x, nameAr: e.target.value } : x)))}
                  />
                  <Input
                    inputMode="numeric"
                    aria-label={t("qty")}
                    className="numerals"
                    value={c.quantity}
                    onChange={(e) =>
                      setCustom((xs) => xs.map((x) => (x.key === c.key ? { ...x, quantity: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))
                    }
                  />
                  <Input
                    inputMode="decimal"
                    aria-label={t("unitPrice")}
                    className="numerals"
                    value={c.unitPrice}
                    onChange={(e) =>
                      setCustom((xs) =>
                        xs.map((x) => (x.key === c.key ? { ...x, unitPrice: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x)),
                      )
                    }
                  />
                  <Button variant="ghost" size="icon" aria-label={tc("remove")} onClick={() => setCustom((xs) => xs.filter((x) => x.key !== c.key))}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustom((xs) => [...xs, { key: nextKey(), nameEn: "", nameAr: "", quantity: 1, unitPrice: 0 }])}
              >
                <Plus aria-hidden /> {t("addCustom")}
              </Button>
            </div>
          </Sheet>

          {/* 2 · Condition report */}
          <Sheet aria-labelledby="cond-title">
            <SheetHeader title={<span id="cond-title">{t("conditionTitle")}</span>} />
            <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
              <p className="text-sm text-ink-2">{t("conditionBody")}</p>
              {findings.map((f) => (
                <div key={f.key} className="grid gap-3 rounded-control border border-rule p-3 sm:grid-cols-[1fr_10rem]">
                  <Field label={t("findingItem")}>
                    <Input
                      list={`items-${f.key}`}
                      value={f.itemName}
                      onChange={(e) => setFindings((fs) => fs.map((x) => (x.key === f.key ? { ...x, itemName: e.target.value } : x)))}
                    />
                    <datalist id={`items-${f.key}`}>
                      {lines.map((l) => (
                        <option key={l.key} value={l.name} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={t("findingKind")}>
                    <Select
                      value={f.kind}
                      onChange={(e) =>
                        setFindings((fs) => fs.map((x) => (x.key === f.key ? { ...x, kind: e.target.value as Finding["kind"] } : x)))
                      }
                    >
                      <option value="stain">{t("stain")}</option>
                      <option value="damage">{t("damage")}</option>
                    </Select>
                  </Field>
                  <Field label={t("findingNote")} className="sm:col-span-2">
                    <Input value={f.note} onChange={(e) => setFindings((fs) => fs.map((x) => (x.key === f.key ? { ...x, note: e.target.value } : x)))} />
                  </Field>
                  <div className="flex items-center gap-3 sm:col-span-2">
                    {f.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.photoUrl} alt={t("photoPreview")} className="size-14 rounded-[4px] object-cover" />
                    ) : null}
                    <input
                      ref={(el) => {
                        fileInputs.current[f.key] = el;
                      }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(f.key, file);
                      }}
                    />
                    <Button variant="outline" size="sm" disabled={f.uploading} onClick={() => fileInputs.current[f.key]?.click()}>
                      {f.uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
                      {f.photoUrl ? t("replacePhoto") : t("addPhoto")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ms-auto"
                      onClick={() => setFindings((fs) => fs.filter((x) => x.key !== f.key))}
                    >
                      <X aria-hidden /> {tc("remove")}
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setNoFindings(false);
                    setFindings((fs) => [...fs, { key: nextKey(), itemName: "", kind: "stain", note: "" }]);
                  }}
                >
                  <Plus aria-hidden /> {t("addFinding")}
                </Button>
                {findings.length === 0 ? (
                  <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-control px-2 text-sm">
                    <input
                      type="checkbox"
                      checked={noFindings}
                      onChange={(e) => setNoFindings(e.target.checked)}
                      className="size-4 accent-[var(--stamp)]"
                    />
                    <ShieldCheck className="size-4 text-success" aria-hidden />
                    {t("noFindings")}
                  </label>
                ) : null}
              </div>
            </div>
          </Sheet>

          <Sheet>
            <SheetHeader title={t("noteTitle")} />
            <div className="px-4 py-4 sm:px-5">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t("notePlaceholder")} aria-label={t("noteTitle")} />
            </div>
          </Sheet>
        </div>

        {/* What the customer will see */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <section className="ticket-notched rounded-ticket bg-card shadow-lift" aria-labelledby="preview-title">
            <div className="flex h-[34px] items-center rounded-t-ticket bg-pink px-4 text-[13px] font-medium text-[#1d1d1f]">
              <span id="preview-title">{t("previewTitle")}</span>
            </div>
            <div className="perforation" aria-hidden />
            <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
              {lines.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-3">{t("previewEmpty")}</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {lines.map((l) => (
                    <li key={l.key} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <span className="numerals text-[12.5px] text-ink-3">{l.quantity}×</span> {l.name}
                      </span>
                      <span className="numerals shrink-0 text-[13px]">{money(locale, l.quantity * l.unitPrice)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="flex flex-col gap-1.5 border-t border-rule pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-2">{t("pieces")}</dt>
                  <dd className="numerals">{pieces}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-2">{t("subtotal")}</dt>
                  <dd className="numerals">{money(locale, totals.subtotal)}</dd>
                </div>
                {totals.vipSurcharge > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-2">{t("vipSurcharge", { tier: pick(locale, tier.nameEn, tier.nameAr) })}</dt>
                    <dd className="numerals">{money(locale, totals.vipSurcharge)}</dd>
                  </div>
                ) : null}
                <div className="mt-1 flex justify-between border-t-2 border-ink pt-2 text-base font-semibold">
                  <dt>{t("total")}</dt>
                  <dd className="numerals">{money(locale, totals.total)}</dd>
                </div>
                {codFee > 0 ? <p className="text-[12.5px] text-ink-3">{t("codFeeNote", { fee: money(locale, codFee) })}</p> : null}
              </dl>
              <p className={cn("rounded-control px-3 py-2 text-[13px]", conditionReady ? "bg-success-wash text-success" : "bg-canary-wash text-canary-ink")}>
                {findings.length > 0
                  ? t("previewFindings", { count: findings.length })
                  : noFindings
                    ? t("previewNoFindings")
                    : t("previewConditionMissing")}
              </p>
              <Button variant="stamp" size="lg" disabled={!ready || pending} onClick={() => setConfirming(true)}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {t("issue")}
              </Button>
              {!ready ? <p className="text-[12.5px] text-ink-3">{t("issueNeeds")}</p> : null}
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title={t("confirmTitle", { number: order.number, total: money(locale, totals.total) })}
          description={t("confirmBody", { customer: isolate(order.customerName || "") })}
          closeLabel={tc("close")}
        >
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {tc("back")}
            </Button>
            <Button variant="stamp" onClick={submit}>
              {t("confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
