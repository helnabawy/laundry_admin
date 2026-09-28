import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Columns3, List, SearchX } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listActiveVendors } from "@/server/auth/scope";
import { boardTickets, listOrders, vendorDrivers, type DriverOption } from "@/server/queries/orders";
import { can } from "@/lib/permissions";
import { BOARD_COLUMNS, ORDER_STATUSES, type OrderKind, type OrderStatus } from "@/domain/order-workflow";
import { Board, type StageNames } from "@/components/orders/board";
import { OrdersTable } from "@/components/orders/orders-table";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { num } from "@/lib/format";
import { cn } from "@/lib/cn";

export async function generateMetadata() {
  const t = await getTranslations("orders");
  return { title: t("title") };
}

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const session = await requirePage("orders.view");
  const t = await getTranslations();
  const locale = await getLocale();
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "board";
  const canOperate = can(session.role, "orders.operate");
  const canCancel = can(session.role, "orders.cancel");

  const header = (
    <PageHeader
      title={t("orders.title")}
      description={view === "board" ? t("orders.boardDescription") : t("orders.listDescription")}
      actions={
        <div className="flex rounded-control bg-counter-deep p-1" role="group" aria-label={t("orders.view")}>
          {(["board", "list"] as const).map((v) => (
            <Link
              key={v}
              href={v === "board" ? "/orders" : "/orders?view=list"}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-[6px] px-3 text-sm font-medium",
                view === v ? "bg-card text-ink shadow-ticket" : "text-ink-2 hover:text-ink",
              )}
            >
              {v === "board" ? <Columns3 className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
              {t(`orders.${v}`)}
            </Link>
          ))}
        </div>
      }
    />
  );

  if (view === "board") {
    const tickets = await boardTickets(session);
    const vendorIds = session.vendorId
      ? [session.vendorId]
      : (await listActiveVendors()).map((v) => v.id);
    const driversByVendor: Record<string, DriverOption[]> = {};
    if (canOperate) {
      await Promise.all(
        vendorIds.map(async (id) => {
          driversByVendor[id] = await vendorDrivers(id);
        }),
      );
    }
    // Stage names in both languages: staff work in both.
    const [en, ar] = await Promise.all([
      getTranslations({ locale: "en", namespace: "stage" }),
      getTranslations({ locale: "ar", namespace: "stage" }),
    ]);
    const stageNames = Object.fromEntries(
      BOARD_COLUMNS.map((c) => [c.id, { en: en(c.id), ar: ar(c.id), hintEn: en(`${c.id}Hint`), hintAr: ar(`${c.id}Hint`) }]),
    ) as StageNames;
    return (
      <>
        {header}
        <Board
          tickets={tickets}
          driversByVendor={driversByVendor}
          canCancel={canCancel}
          canOperate={canOperate}
          stageNames={stageNames}
        />
      </>
    );
  }

  const q = typeof params.q === "string" ? params.q : undefined;
  const statusParam = typeof params.status === "string" ? params.status : undefined;
  const status =
    statusParam === "active" || statusParam === "done" || ORDER_STATUSES.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus | "active" | "done")
      : undefined;
  const kind = params.kind === "SHOP" || params.kind === "WIZARD" ? (params.kind as OrderKind) : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listOrders(session, { q, status, kind, page });

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    sp.set("view", "list");
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (kind) sp.set("kind", kind);
    sp.set("page", String(p));
    return `/orders?${sp.toString()}`;
  };

  return (
    <>
      {header}
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_12rem_auto]" action="/orders">
        <input type="hidden" name="view" value="list" />
        <Input name="q" defaultValue={q} placeholder={t("orders.searchPlaceholder")} aria-label={t("common.search")} />
        <Select name="status" defaultValue={status ?? ""} aria-label={t("orders.status")}>
          <option value="">{t("orders.allStatuses")}</option>
          <option value="active">{t("orders.activeOnly")}</option>
          <option value="done">{t("orders.finishedOnly")}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
        <Select name="kind" defaultValue={kind ?? ""} aria-label={t("orders.kind")}>
          <option value="">{t("orders.allKinds")}</option>
          <option value="SHOP">{t("kind.SHOP")}</option>
          <option value="WIZARD">{t("kind.WIZARD")}</option>
        </Select>
        <Button type="submit" variant="stamp">
          {t("common.apply")}
        </Button>
      </form>

      <Sheet>
        {result.rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("orders.noResults")} body={t("orders.noResultsBody")} />
        ) : (
          <OrdersTable rows={result.rows} showVendor={!session.vendorId} />
        )}
      </Sheet>

      <nav className="mt-4 flex items-center justify-between gap-3 text-sm text-ink-2" aria-label={t("common.pagination")}>
        <span>{t("common.resultsCount", { count: num(locale, result.total) })}</span>
        <span className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" aria-disabled={result.page <= 1}>
            <Link href={pageHref(Math.max(1, result.page - 1))} className={cn(result.page <= 1 && "pointer-events-none opacity-45")}>
              <ChevronLeft className="flip-rtl" aria-hidden />
              {t("common.previous")}
            </Link>
          </Button>
          <span className="numerals text-[13px]">
            {result.page} / {result.pages}
          </span>
          <Button asChild variant="outline" size="sm">
            <Link
              href={pageHref(Math.min(result.pages, result.page + 1))}
              className={cn(result.page >= result.pages && "pointer-events-none opacity-45")}
            >
              {t("common.next")}
              <ChevronRight className="flip-rtl" aria-hidden />
            </Link>
          </Button>
        </span>
      </nav>
    </>
  );
}
