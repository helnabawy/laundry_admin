"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { fetchNotifications, markNotificationsRead } from "@/server/actions/notifications";
import type { StaffNotificationView } from "@/server/notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Realtime bell: listens to /api/admin/events, raises a toast for each new
 * staff notification, and refreshes the current page so boards stay true.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<StaffNotificationView[] | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetchNotifications();
    setItems(res.items);
    setUnread(res.unread);
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/admin/events");
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 400);
    };
    source.addEventListener("notification", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { kind: string; orderId?: string; orderNumber?: number };
      setUnread((n) => n + 1);
      setItems(null);
      toast(t(`kinds.${data.kind}.title`), {
        description: t(`kinds.${data.kind}.body`, { number: data.orderNumber ?? "" }),
        action: data.orderId
          ? { label: t("open"), onClick: () => router.push(`/orders/${data.orderId}`) }
          : undefined,
      });
      scheduleRefresh();
    });
    source.addEventListener("order", scheduleRefresh);
    return () => {
      source.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [router, t]);

  return (
    <Popover.Root onOpenChange={(open) => open && void load()}>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("bellLabel", { count: unread })}>
          <Bell aria-hidden />
          {unread > 0 ? (
            <span className="numerals absolute end-1 top-1 min-w-4 rounded-[4px] bg-canary px-1 text-[10px] leading-4 text-[#3d3000]">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(92vw,24rem)] rounded-ticket border border-rule bg-card text-ink shadow-lift"
        >
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <p className="text-sm font-semibold">{t("title")}</p>
            <Button
              variant="ghost"
              size="sm"
              disabled={unread === 0}
              onClick={async () => {
                await markNotificationsRead();
                setUnread(0);
                setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? null);
              }}
            >
              <CheckCheck aria-hidden /> {t("markAllRead")}
            </Button>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto py-1">
            {items === null ? (
              <li className="px-4 py-6 text-center text-sm text-ink-3">{t("loading")}</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-ink-3">{t("empty")}</li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.orderId ? `/orders/${n.orderId}` : "/notifications"}
                    className={cn(
                      "flex gap-3 px-4 py-2.5 hover:bg-card-recessed",
                      !n.read && "bg-canary-wash/60",
                    )}
                    onClick={() => void markNotificationsRead([n.id])}
                  >
                    <span
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-ink")}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{t(`kinds.${n.kind}.title`)}</span>
                      <span className="block text-[13px] text-ink-2">
                        {t(`kinds.${n.kind}.body`, { number: n.orderNumber ?? "" })}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        {format.relativeTime(new Date(n.createdAt), now)}
                        {n.read ? null : <span className="sr-only">, {t("unread")}</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-rule px-4 py-2.5">
            <Link href="/notifications" className="text-sm font-medium underline decoration-rule-strong hover:decoration-ink">
              {t("viewAll")}
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
