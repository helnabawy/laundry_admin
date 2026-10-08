"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { refundPaymentAction } from "@/server/actions/finance";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";

/**
 * Full or partial refund. States the consequence before it commits: the money
 * goes back to the customer and the provider keeps its fee.
 */
export function RefundDialog({
  paymentId,
  refundable,
  provider,
}: {
  paymentId: string;
  refundable: number;
  provider: string;
}) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(refundable));
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= refundable && reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="dangerOutline"
        size="sm"
        onClick={() => {
          // Start from what's left to refund, not the last attempt's numbers.
          setAmount(String(refundable));
          setReason("");
          setOpen(true);
        }}
      >
        <Undo2 aria-hidden /> {t("refund")}
      </Button>
      <DialogContent
        title={t("refundTitle")}
        description={t("refundBody", { max: money(locale, refundable), provider })}
        closeLabel={tc("close")}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            start(async () => {
              const res = await refundPaymentAction(paymentId, { amount: value, reason });
              if (res.ok) {
                toast.success(t("refundDone", { amount: money(locale, value) }));
                setOpen(false);
              } else toast.error(res.error);
            });
          }}
        >
          <Field label={t("refundAmount")} htmlFor={`refund-${paymentId}`} hint={t("refundMax", { max: money(locale, refundable) })}>
            <div className="flex gap-2">
              <Input id={`refund-${paymentId}`} inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => setAmount(String(refundable))}>{t("refundAll")}</Button>
            </div>
          </Field>
          <Field label={t("refundReason")} htmlFor={`refund-reason-${paymentId}`}>
            <Textarea id={`refund-reason-${paymentId}`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
            <Button type="submit" variant="danger" disabled={!valid || pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {valid ? t("refundConfirm", { amount: money(locale, value) }) : t("refund")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
