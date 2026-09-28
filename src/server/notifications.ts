import "server-only";
import { db } from "@/server/db";
import { vendorWhere } from "@/server/auth/scope";
import type { Session } from "@/server/auth/session";

export interface StaffNotificationView {
  id: string;
  kind: string;
  orderId: string | null;
  orderNumber: number | null;
  createdAt: string;
  read: boolean;
}

export async function staffNotifications(
  session: Session,
  opts: { take?: number; unreadOnly?: boolean } = {},
): Promise<StaffNotificationView[]> {
  const scope = await vendorWhere(session);
  const rows = await db.notification.findMany({
    where: {
      audience: "staff",
      ...scope,
      ...(opts.unreadOnly ? { staffReads: { none: { staffUserId: session.userId } } } : {}),
    },
    include: { staffReads: { where: { staffUserId: session.userId }, select: { readAt: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 30,
  });
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    orderId: n.orderId,
    orderNumber: n.orderNumber,
    createdAt: n.createdAt.toISOString(),
    read: n.staffReads.length > 0,
  }));
}

export async function unreadCount(session: Session): Promise<number> {
  const scope = await vendorWhere(session);
  return db.notification.count({
    where: { audience: "staff", ...scope, staffReads: { none: { staffUserId: session.userId } } },
  });
}

export async function markRead(session: Session, ids?: string[]) {
  const scope = await vendorWhere(session);
  const unread = await db.notification.findMany({
    where: {
      audience: "staff",
      ...scope,
      ...(ids ? { id: { in: ids } } : {}),
      staffReads: { none: { staffUserId: session.userId } },
    },
    select: { id: true },
  });
  if (unread.length === 0) return;
  await db.staffNotificationRead.createMany({
    data: unread.map((n) => ({ notificationId: n.id, staffUserId: session.userId })),
    skipDuplicates: true,
  });
}
