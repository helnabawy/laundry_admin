import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BellOff } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { staffNotifications } from "@/server/notifications";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkAllRead } from "@/components/shell/mark-all-read";
import { cn } from "@/lib/cn";

export async function generateMetadata() {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

export default async function NotificationsPage() {
  const session = await requirePage("orders.view");
  const t = await getTranslations("notifications");
  const locale = await getLocale();
  const items = await staffNotifications(session, { take: 100 });
  const hasUnread = items.some((n) => !n.read);
  return (
    <>
      <PageHeader title={t("title")} description={t("pageDescription")} actions={hasUnread ? <MarkAllRead /> : null} />
      <Sheet className="max-w-3xl">
        {items.length === 0 ? (
          <EmptyState icon={BellOff} title={t("empty")} />
        ) : (
          <ul className="divide-y divide-rule">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.orderId ? `/orders/${n.orderId}` : "#"}
                  className={cn("flex gap-3 px-4 py-3 hover:bg-card-recessed sm:px-5", !n.read && "bg-canary-wash/50")}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-ink")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {t(`kinds.${n.kind}.title`)}
                      {!n.read ? <span className="sr-only">, {t("unread")}</span> : null}
                    </span>
                    <span className="block text-[13px] text-ink-2">{t(`kinds.${n.kind}.body`, { number: n.orderNumber ?? "" })}</span>
                  </span>
                  <span className="numerals shrink-0 text-[12px] text-ink-3">{dateTime(locale, n.createdAt, "dayTime")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
