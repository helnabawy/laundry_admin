import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/server/auth/session";
import { can } from "@/lib/permissions";
import {
  financeData,
  listExpenses,
  parseExpenseCategory,
  parseFinanceRange,
  parseLedgerFilters,
  paymentLedgerExport,
} from "@/server/queries/finance";
import { switcherVendorId } from "@/server/auth/scope";
import { audit } from "@/server/orders/transition";
import { db } from "@/server/db";
import { TIME_ZONE } from "@/lib/format";

export const dynamic = "force-dynamic";

const DATASETS = ["payments", "expenses", "pnl"] as const;
type Dataset = (typeof DATASETS)[number];

/**
 * GET /api/admin/finance/export?dataset=payments|expenses|pnl&format=csv|xlsx&from=&to=
 * Vendor-scoped like the finance pages; every export is audited.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!can(session.role, "finance.view")) return new Response("Forbidden", { status: 403 });

  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const dataset: Dataset = DATASETS.includes(params.dataset as Dataset) ? (params.dataset as Dataset) : "payments";
  const format = params.format === "csv" ? "csv" : "xlsx";
  const range = parseFinanceRange(params);
  const t = await getTranslations("finance");
  const lang = session.locale === "ar" ? "ar" : "en";
  const localTime = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: TIME_ZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .format(d)
          .replace(",", "")
      : "";

  let headers: string[];
  let data: (string | number)[][];
  /** 1-based columns holding AED amounts (XLSX number format). */
  let moneyColumns: number[];

  if (dataset === "payments") {
    const rows = await paymentLedgerExport(session, parseLedgerFilters(params));
    headers = [t("when"), t("paidAt"), t("order"), t("customer"), t("laundry"), t("providerLabel"), t("methodLabel"), t("statusLabel"), t("reference"), t("amount"), t("fees"), t("refunds"), t("net"), t("failure")];
    data = rows.map((r) => [
      localTime(r.createdAt),
      localTime(r.paidAt),
      r.orderNumber,
      r.customerName,
      lang === "ar" ? r.vendor.nameAr : r.vendor.nameEn,
      t(`provider.${r.provider}`),
      t(`method.${r.method}`),
      t(`status.${r.status}`),
      r.reference ?? "",
      r.amount,
      r.fee,
      r.refunded,
      r.net,
      r.failureReason ?? "",
    ]);
    moneyColumns = [10, 11, 12, 13];
  } else if (dataset === "expenses") {
    const rows = await listExpenses(session, { ...range, category: parseExpenseCategory(params.category) });
    headers = [t("date"), t("categoryLabel"), t("descriptionLabel"), t("laundry"), t("amount"), t("addedByColumn")];
    data = rows.map((r) => [
      r.incurredOn,
      t(`category.${r.category}`),
      r.description,
      lang === "ar" ? r.vendor.nameAr : r.vendor.nameEn,
      r.amount,
      r.createdBy ?? "",
    ]);
    moneyColumns = [5];
  } else {
    const d = await financeData(session, range);
    headers = [t("date"), t("gross"), t("refunds"), t("netRevenue"), t("fees"), t("expenses"), t("profit")];
    data = [
      ...d.perDay.map((r) => [r.date, r.gross, r.refunds, r.netRevenue, r.fees, r.expenses, r.profit]),
      [t("total"), d.pnl.gross, d.pnl.refunds, d.pnl.netRevenue, d.pnl.fees, d.pnl.expenses, d.pnl.profit],
    ];
    moneyColumns = [2, 3, 4, 5, 6, 7];
  }

  await audit(db, {
    actorId: session.userId,
    vendorId: await switcherVendorId(session),
    action: "finance.export",
    entity: "Finance",
    data: { dataset, format, rows: data.length, from: range.from, to: range.to },
  });

  const filename = `laundry-${dataset}_${range.from}_${range.to}.${format}`;
  if (format === "csv") {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // BOM so Excel opens Arabic text as UTF-8.
    const csv = "﻿" + [headers, ...data].map((row) => row.map(esc).join(",")).join("\r\n");
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t(`sheet.${dataset}`), { views: [{ rightToLeft: lang === "ar", state: "frozen", ySplit: 1 }] });
  ws.addRow(headers).font = { bold: true };
  for (const row of data) ws.addRow(row);
  if (dataset === "pnl") ws.lastRow!.font = { bold: true };
  for (const c of moneyColumns) ws.getColumn(c).numFmt = '#,##0.00 "AED"';
  ws.columns.forEach((c) => {
    c.width = 16;
  });
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
