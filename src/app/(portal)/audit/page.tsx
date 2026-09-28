import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { db } from "@/server/db";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export async function generateMetadata() {
  const t = await getTranslations("audit");
  return { title: t("title") };
}

const PAGE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requirePage("audit.view");
  const t = await getTranslations("audit");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { actor: { select: { name: true, email: true } } },
    }),
    db.auditLog.count(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Sheet>
        {rows.length === 0 ? (
          <EmptyState icon={ScrollText} title={t("empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-rule text-[12.5px] text-ink-3">
                  <th scope="col" className="px-4 py-2.5 text-start font-medium sm:px-5">{t("when")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("who")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("action")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium sm:px-5">{t("target")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-rule last:border-0">
                    <td className="numerals px-4 py-2.5 text-[12.5px] text-ink-2 sm:px-5">{dateTime(locale, r.createdAt)}</td>
                    <td className="px-3 py-2.5">{r.actor?.name ?? t("system")}</td>
                    <td className="px-3 py-2.5">
                      <code className="rounded-[4px] bg-card-recessed px-1.5 py-0.5 font-numerals text-[12px]" dir="ltr">{r.action}</code>
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-ink-2 sm:px-5">
                      {r.entity === "Order" && r.entityId ? (
                        <Link href={`/orders/${r.entityId}`} className="underline decoration-rule-strong hover:decoration-ink">{r.entity}</Link>
                      ) : (
                        r.entity
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
      <nav className="mt-4 flex items-center justify-end gap-2" aria-label={tc("pagination")}>
        <Button asChild variant="outline" size="sm">
          <Link href={`/audit?page=${Math.max(1, page - 1)}`} className={cn(page <= 1 && "pointer-events-none opacity-45")}>
            <ChevronLeft className="flip-rtl" aria-hidden /> {tc("previous")}
          </Link>
        </Button>
        <span className="numerals text-[13px] text-ink-2">{page} / {pages}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={`/audit?page=${Math.min(pages, page + 1)}`} className={cn(page >= pages && "pointer-events-none opacity-45")}>
            {tc("next")} <ChevronRight className="flip-rtl" aria-hidden />
          </Link>
        </Button>
      </nav>
    </>
  );
}
