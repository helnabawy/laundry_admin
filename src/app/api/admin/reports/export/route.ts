import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/server/auth/session";
import { can } from "@/lib/permissions";
import { parseReportFilters, reportExportRows } from "@/server/queries/reports";
import { audit } from "@/server/orders/transition";
import { db } from "@/server/db";
import { TIME_ZONE } from "@/lib/format";

export const dynamic = "force-dynamic";

/** GET /api/admin/reports/export?format=csv|xlsx&<report filters> (super admin). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!can(session.role, "reports.view")) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const filters = parseReportFilters(params);
  const format = params.format === "xlsx" ? "xlsx" : "csv";
  const rows = await reportExportRows(filters);
  const t = await getTranslations();
  const lang = session.locale === "ar" ? "ar" : "en";

  const headers = [
    t("orders.number"),
    t("reports.created"),
    t("orders.laundry"),
    t("orders.kind"),
    t("orders.status"),
    t("reports.customer"),
    t("drivers.phone"),
    t("orders.tier"),
    t("orders.pickup"),
    t("orders.delivery"),
    t("invoice.title", { number: "" }).trim(),
    t("reports.payment"),
    t("reports.paid"),
    t("reports.total"),
    t("failure.title"),
    t("orders.rating"),
  ];
  const localTime = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(d)
      .replace(",", "");
  const data = rows.map((r) => [
    r.number,
    localTime(r.createdAt),
    r.vendor[lang],
    t(`kind.${r.kind}`),
    t(`status.${r.status}`),
    r.customerName,
    r.customerPhone,
    r.tier[lang] || r.tier.en,
    r.pickupDriver ?? "",
    r.deliveryDriver ?? "",
    r.invoiceNumber ?? "",
    r.paymentMethod ? t(`payment.${r.paymentMethod}`) : "",
    r.paid === null ? "" : r.paid ? t("payment.paid") : t("payment.unpaid"),
    r.total ?? "",
    r.failure ? t(`failure.reason.${r.failure.split(":")[1]}`) : "",
    r.rating ?? "",
  ]);

  await audit(db, {
    actorId: session.userId,
    vendorId: filters.vendorId ?? null,
    action: "report.export",
    entity: "Report",
    data: { format, rows: rows.length, filters: { ...filters } },
  });

  const filename = `laundry-requests_${filters.from}_${filters.to}.${format}`;
  if (format === "csv") {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // BOM so Excel opens Arabic text as UTF-8.
    const csv = "﻿" + [headers, ...data].map((row) => row.map(esc).join(",")).join("\r\n");
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t("reports.results"), { views: [{ rightToLeft: lang === "ar", state: "frozen", ySplit: 1 }] });
  ws.addRow(headers).font = { bold: true };
  for (const row of data) ws.addRow(row);
  ws.getColumn(14).numFmt = '#,##0.00 "AED"';
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
