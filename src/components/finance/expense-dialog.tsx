"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteExpenseAction, saveExpenseAction } from "@/server/actions/finance";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/domain/finance";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export interface ExpenseDraft {
  id: string | null;
  category: ExpenseCategory;
  amount: string;
  incurredOn: string;
  description: string;
}

/** Add or edit one expense. `expense` absent → the "Add expense" button. */
export function ExpenseDialog({ expense, today }: { expense?: ExpenseDraft; today: string }) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const initial: ExpenseDraft = expense ?? { id: null, category: "supplies", amount: "", incurredOn: today, description: "" };

  const submit = (form: FormData) => {
    start(async () => {
      const res = await saveExpenseAction(initial.id, {
        category: String(form.get("category")) as ExpenseCategory,
        amount: String(form.get("amount")),
        incurredOn: String(form.get("incurredOn")),
        description: String(form.get("description") ?? ""),
      });
      if (res.ok) {
        toast.success(initial.id ? t("expenseUpdated") : t("expenseAdded"));
        setErrors({});
        setOpen(false);
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {expense ? (
        <Button variant="ghost" size="iconSm" aria-label={t("editExpense")} onClick={() => setOpen(true)}>
          <Pencil aria-hidden />
        </Button>
      ) : (
        <Button variant="stamp" onClick={() => setOpen(true)}>
          <Plus aria-hidden /> {t("addExpense")}
        </Button>
      )}
      <DialogContent title={expense ? t("editExpense") : t("addExpense")} description={t("expenseHelp")} closeLabel={tc("close")}>
        <form action={submit} className="grid gap-4">
          <Field label={t("categoryLabel")} htmlFor="exp-category" error={errors.category}>
            <Select id="exp-category" name="category" defaultValue={initial.category}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`category.${c}`)}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("amountAed")} htmlFor="exp-amount" error={errors.amount}>
              <Input id="exp-amount" name="amount" inputMode="decimal" required defaultValue={initial.amount} dir="ltr" />
            </Field>
            <Field label={t("date")} htmlFor="exp-date" error={errors.incurredOn}>
              <Input id="exp-date" name="incurredOn" type="date" required defaultValue={initial.incurredOn} max={today} />
            </Field>
          </div>
          <Field label={t("descriptionLabel")} htmlFor="exp-description" error={errors.description}>
            <Textarea id="exp-description" name="description" maxLength={300} defaultValue={initial.description} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
            <Button type="submit" variant="stamp" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t("saveExpense")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteExpenseButton({ id, label }: { id: string; label: string }) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="iconSm" aria-label={t("deleteExpense")} onClick={() => setOpen(true)}>
        <Trash2 aria-hidden />
      </Button>
      <DialogContent title={t("deleteExpenseTitle")} description={t("deleteExpenseBody", { expense: label })} closeLabel={tc("close")}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteExpenseAction(id);
                if (res.ok) {
                  toast.success(t("expenseDeleted"));
                  setOpen(false);
                } else toast.error(res.error);
              })
            }
          >
            {t("deleteExpense")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
