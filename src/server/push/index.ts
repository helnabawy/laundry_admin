import "server-only";
import { db } from "@/server/db";
import { pushCopy, vendorTopic, type PushLang } from "@/domain/push-copy";
import { orderFcmMessage, orderPushData } from "@/domain/push-message";
import type { Tx } from "@/server/orders/transition";

/**
 * Push notifications to the mobile app through Firebase Cloud Messaging.
 *
 * Two kinds of message:
 * - **Order pushes** — one per mobile `Notification` row (customer or driver),
 *   with visible text plus `data` the app uses to refresh and deep-link.
 * - **Catalogue pings** — data-only messages to a laundry's topic so open apps
 *   refetch prices, tiers and time slots after a portal edit.
 *
 * Sending happens only after the database transaction commits, and never
 * fails the request that triggered it. Without `FIREBASE_SERVICE_ACCOUNT_JSON`
 * (local dev, tests) messages are logged instead of sent.
 */

export interface OrderPush {
  mobileUserId: string;
  kind: string;
  orderId: string;
  orderNumber: number;
  vendorId: string;
  status: string;
}

interface TokenMessage {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

/** What happened to one message; `error` is FCM's error code. */
export interface PushResult {
  token: string;
  error?: string;
}

interface PushDriver {
  /** Which driver this is — `log` when pushes are only printed. */
  name: "firebase" | "log";
  sendToTokens(messages: TokenMessage[]): Promise<PushResult[]>;
  sendToTopic(topic: string, data: Record<string, string>): Promise<void>;
}

const logDriver: PushDriver = {
  name: "log",
  async sendToTokens(messages) {
    for (const m of messages) console.info(`[push] ${m.token.slice(0, 12)}… ${m.title} — ${m.body}`, m.data);
    return messages.map((m) => ({ token: m.token }));
  },
  async sendToTopic(topic, data) {
    console.info(`[push] topic ${topic}`, data);
  },
};

const UNREGISTERED = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

async function firebaseDriver(serviceAccountJson: string): Promise<PushDriver> {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getMessaging } = await import("firebase-admin/messaging");
  const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  const messaging = getMessaging(app);
  return {
    name: "firebase",
    async sendToTokens(messages) {
      if (!messages.length) return [];
      const res = await messaging.sendEach(messages.map(orderFcmMessage));
      return res.responses.map((r, i) => ({ token: messages[i].token, error: r.success ? undefined : r.error?.code }));
    },
    async sendToTopic(topic, data) {
      await messaging.send({
        topic,
        data,
        android: { priority: "normal" },
        apns: { headers: { "apns-push-type": "background", "apns-priority": "5" }, payload: { aps: { contentAvailable: true } } },
      });
    },
  };
}

const globalForPush = globalThis as unknown as { pushDriver?: Promise<PushDriver> };

function driver(): Promise<PushDriver> {
  return (globalForPush.pushDriver ??= (async () => {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!json) return logDriver;
    try {
      return await firebaseDriver(json);
    } catch (error) {
      console.error("[push] Firebase setup failed; logging pushes instead", error);
      return logDriver;
    }
  })());
}

// ---- Collecting pushes inside a transaction -----------------------------------

const outboxes = new WeakMap<object, OrderPush[]>();
const inFlight = new Set<Promise<void>>();

/**
 * Runs `fn` with an outbox attached to its transaction, then sends whatever
 * `queuePush` collected — only once the transaction has committed.
 */
export async function withPushOutbox<T>(run: (begin: (tx: Tx) => void) => Promise<T>): Promise<T> {
  const jobs: OrderPush[] = [];
  const result = await run((tx) => outboxes.set(tx, jobs));
  if (jobs.length) {
    const sending: Promise<void> = sendOrderPushes(jobs)
      .then(() => {})
      .finally(() => inFlight.delete(sending));
    inFlight.add(sending);
  }
  return result;
}

/**
 * Waits for pushes still being sent. A long-running server never needs this;
 * a short-lived script (`pnpm staff`) calls it before exiting.
 */
export async function flushPushes() {
  await Promise.all(inFlight);
}

/** Queues an order push on the transaction's outbox (no-op without one). */
export function queuePush(tx: Tx, push: OrderPush) {
  outboxes.get(tx)?.push(push);
}

// ---- Sending ------------------------------------------------------------------

/**
 * Sends each push to every device of its user and forgets tokens FCM rejects
 * as unregistered. Returns what happened per device (empty when the users
 * have none, or sending failed — which is logged, never thrown).
 */
export async function sendOrderPushes(jobs: OrderPush[]): Promise<PushResult[]> {
  try {
    const tokens = await db.deviceToken.findMany({
      where: { mobileUserId: { in: [...new Set(jobs.map((j) => j.mobileUserId))] } },
    });
    if (!tokens.length) return [];
    const messages = jobs.flatMap((job) =>
      tokens
        .filter((t) => t.mobileUserId === job.mobileUserId)
        .map((t) => ({
          token: t.token,
          ...pushCopy((t.locale === "ar" ? "ar" : "en") as PushLang, job.kind, job.orderNumber),
          data: orderPushData(job),
        })),
    );
    const results = await (await driver()).sendToTokens(messages);
    const dead = results.flatMap((r) => (r.error && UNREGISTERED.has(r.error) ? [r.token] : []));
    if (dead.length) await db.deviceToken.deleteMany({ where: { token: { in: dead } } });
    return results;
  } catch (error) {
    console.error("[push] order push failed", error);
    return [];
  }
}

/** `firebase` when pushes really go out, `log` when they're only printed. */
export async function pushDriverName() {
  return (await driver()).name;
}

/** Tells open apps of this laundry that its catalogue, tiers or slots changed. */
export async function publishCatalogueChanged(vendorId: string) {
  try {
    await (await driver()).sendToTopic(vendorTopic(vendorId), { type: "catalogue", vendorId });
  } catch (error) {
    console.error("[push] catalogue ping failed", error);
  }
}
