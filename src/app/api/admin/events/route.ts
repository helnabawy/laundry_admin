import { getSession } from "@/server/auth/session";
import { scopeVendorIds } from "@/server/auth/scope";
import { subscribe } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events for the portal: new notifications and order changes in
 * the viewer's laundries — the switcher's choice included (the bell
 * remounts, and so reconnects, when the switcher changes). The browser's
 * EventSource reconnects on its own.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const vendorIds = await scopeVendorIds(session);

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 5000\n\n");
      const unsubscribe = await subscribe((event) => {
        if (vendorIds && !vendorIds.includes(event.vendorId)) return;
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      // Keep proxies from closing an idle stream.
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
