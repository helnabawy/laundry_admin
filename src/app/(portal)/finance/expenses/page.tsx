import { getLocale, getTranslations } from "next-intl/server";
import { Download, Receipt } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listExpenses, parseExpenseCategory, parseFinanceRange } from "@/server/queries/finance";
import { EXPENSE_CATEGORIES } from "@/domain/finance";
import { localDateOf } from "@/domain/slots";
import { dateTime, money, pick } from "@/lib/format";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { RangePicker } from "@/components/finance/range-picker";
import { DeleteExpenseButton, ExpenseDialog } from "@/components/finance/expense-dialog";

export default async function ExpensesPage({ searchParams }: PageProps<"/finance/expenses">) {
  const session = await requirePage("finance.view");
  const t = await getTranslations();
  const locale = await getLocale();
  const params = await searchParams;
  const range = parseFinanceRange(params);
  const category = parseExpenseCategory(params.category);
  const rows = await listExpenses(session, { ...range, category });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const manage = can(session.role, "finance.manage");
  const today = localDateOf(new Date());
  const showLaundry = !session.vendorId;
  const qs = new URLSearchParams({ from: range.from, to: range.to, ...(category ? { category } : {}) });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <RangePicker path="/finance/expenses" range={range} preset={range.preset} extra={{ category }} />
        <div className="flex gap-2">
          <Button asChild size="sm">
            <a href={`/api/admin/finance/export?dataset=expenses&format=xlsx&${qs}`}>
              <Download aria-hidden /> XLSX
            </a>
          </Button>
          {manage ? <ExpenseDialog today={today} /> : null}
        </div>
      </div>

      <form action="/finance/expenses" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="from" value={range.from} />
        <input type="hidden" name="to" value={range.to} />
        <label className="flex flex-col gap-1 text-[13px] font-medium text-ink-2">
          {t("finance.categoryLabel")}
          <Select name="category" defaultValue={category ?? ""} className="h-9 w-48">
            <option value="">{t("finance.anyCategory")}</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`finance.category.${c}`)}</option>
            ))}
          </Select>
        </label>
        <Button type="submit" size="sm" className="h-9">{t("common.apply")}</Button>
      </form>

      <Sheet>
        <SheetHeader
          title={t("finance.expenses")}
          actions={<span className="numerals text-sm font-semibold">{money(locale, total)}</span>}
        />
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title={t("finance.noExpenses")} body={manage ? t("finance.noExpensesBody") : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">{t("finance.expenses")}</caption>
              <thead>
                <tr className="border-b border-rule text-[12.5px] text-ink-3">
                  <th scope="col" className="px-4 py-2.5 text-start font-medium sm:px-5">{t("finance.date")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("finance.categoryLabel")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("finance.descriptionLabel")}</th>
                  {showLaundry ? <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("orders.laundry")}</th> : null}
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">{t("finance.amount")}</th>
                  {manage ? <th scope="col" className="w-24 px-4 py-2.5 sm:px-5"><span className="sr-only">{t("finance.actions")}</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const label = `${t(`finance.category.${r.category}`)} · ${money(locale, r.amount)}`;
                  return (
                    <tr key={r.id} className="border-b border-rule last:border-0 hover:bg-card-recessed">
                      <td className="numerals px-4 py-2.5 text-ink-2 sm:px-5">{dateTime(locale, `${r.incurredOn}T12:00:00+04:00`, "date")}</td>
                      <td className="px-3 py-2.5">{t(`finance.category.${r.category}`)}</td>
                      <td className="max-w-72 px-3 py-2.5 text-ink-2">
                        <span className="block truncate">{r.description || "—"}</span>
                        {r.createdBy ? <span className="block text-[12px] text-ink-3">{t("finance.addedBy", { name: r.createdBy })}</span> : null}
                      </td>
                      {showLaundry ? <td className="px-3 py-2.5 text-ink-2">{pick(locale, r.vendor.nameEn, r.vendor.nameAr)}</td> : null}
                      <td className="numerals px-3 py-2.5 text-end font-medium">{money(locale, r.amount)}</td>
                      {manage ? (
                        <td className="px-4 py-1.5 text-end sm:px-5">
                          <div className="flex justify-end">
                            <ExpenseDialog
                              today={today}
                              expense={{ id: r.id, category: r.category, amount: String(r.amount), incurredOn: r.incurredOn, description: r.description }}
                            />
                            <DeleteExpenseButton id={r.id} label={label} />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </>
  );
}
