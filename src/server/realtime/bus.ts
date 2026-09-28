import "server-only";
import { EventEmitter } from "node:events";
import { Client } from "pg";

/**
 * Realtime fan-out for the portal. Writers call `pg_notify('portal_events',
 * json)` inside their transaction (delivered only on commit); every server
 * instance keeps one LISTEN connection and re-emits events to its open SSE
 * streams. No extra infrastructure beyond Postgres.
 */

export const CHANNEL = "portal_events";

export interface PortalEvent {
  type: "notification" | "order";
  vendorId: string;
  orderId?: string;
  orderNumber?: number;
  status?: string;
  notificationId?: string;
  kind?: string;
}

interface BusState {
  emitter: EventEmitter;
  client: Client | null;
  connecting: Promise<void> | null;
}

const globalForBus = globalThis as unknown as { portalBus?: BusState };

const state: BusState = (globalForBus.portalBus ??= {
  emitter: new EventEmitter().setMaxListeners(0),
  client: null,
  connecting: null,
});

async function ensureListening(): Promise<void> {
  if (state.client) return;
  state.connecting ??= (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        state.emitter.emit("event", JSON.parse(msg.payload) as PortalEvent);
      } catch {
        // Ignore malformed payloads.
      }
    });
    client.on("error", () => {
      // Drop the connection; the next subscriber reconnects.
      state.client = null;
      client.end().catch(() => {});
    });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    state.client = client;
  })().finally(() => {
    state.connecting = null;
  });
  await state.connecting;
}

export async function subscribe(
  listener: (event: PortalEvent) => void,
): Promise<() => void> {
  await ensureListening();
  state.emitter.on("event", listener);
  return () => state.emitter.off("event", listener);
}
