import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, CircleOff, Smartphone } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listCustomers } from "@/server/queries/customers";
import { dateTime, money, num, pick } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export async function generateMetadata() {
  const t = await getTranslations("users");
  return { title: t("title") };
}

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const session = await requirePage("customers.manage");
  const t = await getTranslations();
  const locale = await getLocale();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const status = params.status === "active" || params.status === "blocked" ? params.status : undefined;
  const platform = !session.vendorId;
  const role = platform && (params.role === "customer" || params.role === "driver") ? params.role : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listCustomers(session, { q, status, role, page });

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (role) sp.set("role", role);
    sp.set("page", String(p));
    return `/users?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={t("users.title")}
        description={session.vendorId ? t("users.descriptionLaundry") : t("users.description")}
      />
      <form
        className={cn("mb-4 grid gap-2", platform ? "sm:grid-cols-[1fr_11rem_11rem_auto]" : "sm:grid-cols-[1fr_12rem_auto]")}
        action="/users"
      >
        <Input name="q" defaultValue={q} placeholder={t("users.searchPlaceholder")} aria-label={t("common.search")} />
        {platform ? (
          <Select name="role" defaultValue={role ?? ""} aria-label={t("users.role")}>
            <option value="">{t("users.allRoles")}</option>
            <option value="customer">{t("users.roles.customer")}</option>
            <option value="driver">{t("users.roles.driver")}</option>
          </Select>
        ) : null}
        <Select name="status" defaultValue={status ?? ""} aria-label={t("users.status")}>
          <option value="">{t("users.allStatuses")}</option>
          <option value="active">{t("users.active")}</option>
          <option value="blocked">{t("users.blockedStatus")}</option>
        </Select>
        <Button type="submit" variant="stamp">
          {t("common.apply")}
        </Button>
      </form>

      <Sheet>
        {result.rows.length === 0 ? (
          <EmptyState icon={Smartphone} title={t("users.empty")} body={q || status ? t("users.emptyFiltered") : t("users.emptyBody")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-rule text-[12.5px] text-ink-3">
                  <th scope="col" className="px-4 py-3 text-start font-medium sm:px-5">{t("users.name")}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("users.phone")}</th>
                  {platform ? (
                    <>
                      <th scope="col" className="px-3 py-3 text-start font-medium">{t("users.role")}</th>
                      <th scope="col" className="px-3 py-3 text-start font-medium">{t("users.laundry")}</th>
                    </>
                  ) : null}
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("users.orders")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("users.paid")}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("users.lastOrder")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium sm:px-5">{t("users.joined")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((u) => (
                  <tr key={u.id} className={cn("group border-b border-rule last:border-0 hover:bg-card-recessed", !u.isActive && "text-ink-3")}>
                    <td className="px-4 py-3 sm:px-5">
                      <Link href={`/users/${u.id}`} className="flex items-center gap-2 font-medium underline decoration-transparent underline-offset-4 group-hover:decoration-ink">
                        {u.fullName || t("users.noName")}
                        {!u.isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-[4px] bg-danger-wash px-1.5 text-[11.5px] font-medium text-danger">
                            <CircleOff className="size-3" aria-hidden />
                            {t("users.blockedStatus")}
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="numerals px-3 py-3 text-[13px]" dir="ltr">{u.phone}</td>
                    {platform ? (
                      <>
                        <td className="px-3 py-3 text-ink-2">{t(`users.roles.${u.role}`)}</td>
                        <td className="px-3 py-3 text-ink-2">
                          {u.vendor ? pick(locale, u.vendor.en, u.vendor.ar) : <span className="text-ink-3">{t("users.allLaundries")}</span>}
                        </td>
                      </>
                    ) : null}
                    <td className="numerals px-3 py-3 text-end">{u.role === "driver" ? "—" : u.orders}</td>
                    <td className="numerals px-3 py-3 text-end">{u.role === "driver" ? "—" : money(locale, u.paidTotal)}</td>
                    <td className="numerals px-3 py-3 text-[12.5px] text-ink-2">
                      {u.lastOrderAt ? dateTime(locale, u.lastOrderAt, "date") : <span className="font-sans">—</span>}
                    </td>
                    <td className="numerals px-4 py-3 text-[12.5px] text-ink-2 sm:px-5">{dateTime(locale, u.createdAt, "date")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>

      <nav className="mt-4 flex items-center justify-between gap-3 text-sm text-ink-2" aria-label={t("common.pagination")}>
        <span>{t("common.resultsCount", { count: num(locale, result.total) })}</span>
        <span className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(Math.max(1, result.page - 1))} className={cn(result.page <= 1 && "pointer-events-none opacity-45")}>
              <ChevronLeft className="flip-rtl" aria-hidden /> {t("common.previous")}
            </Link>
          </Button>
          <span className="numerals text-[13px]">{result.page} / {result.pages}</span>
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(Math.min(result.pages, result.page + 1))} className={cn(result.page >= result.pages && "pointer-events-none opacity-45")}>
              {t("common.next")} <ChevronRight className="flip-rtl" aria-hidden />
            </Link>
          </Button>
        </span>
      </nav>
    </>
  );
}
