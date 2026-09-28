"use server";

import { requireCapability } from "@/server/auth/session";
import { markRead, staffNotifications, unreadCount } from "@/server/notifications";

export async function fetchNotifications() {
  const session = await requireCapability("orders.view");
  const [items, unread] = await Promise.all([staffNotifications(session, { take: 12 }), unreadCount(session)]);
  return { items, unread };
}

export async function markNotificationsRead(ids?: string[]) {
  const session = await requireCapability("orders.view");
  await markRead(session, ids);
}
