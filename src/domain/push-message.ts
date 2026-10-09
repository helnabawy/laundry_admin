/**
 * The FCM message for an order push — what the mobile app receives. Pure — no
 * I/O; `src/server/push` sends it.
 */

/**
 * Android notification channel for order pushes. The app creates it with high
 * importance (heads-up banner, sound) — must match `LocalNotifications.channelId`
 * and the manifest's `default_notification_channel_id` in laundry_app.
 */
export const ORDER_PUSH_CHANNEL = "order_updates";

export interface OrderPushData {
  kind: string;
  orderId: string;
  orderNumber: number;
  vendorId: string;
  status: string;
}

/** The `data` the app routes and refreshes by (`push_service.dart` `routeFor`). */
export function orderPushData(job: OrderPushData): Record<string, string> {
  return {
    type: "order",
    kind: job.kind,
    orderId: job.orderId,
    orderNumber: String(job.orderNumber),
    status: job.status,
    vendorId: job.vendorId,
  };
}

export function orderFcmMessage(m: { token: string; title: string; body: string; data: Record<string, string> }) {
  return {
    token: m.token,
    notification: { title: m.title, body: m.body },
    data: m.data,
    android: {
      priority: "high" as const,
      notification: { channelId: ORDER_PUSH_CHANNEL, sound: "default" },
    },
    apns: { payload: { aps: { sound: "default" } } },
  };
}
