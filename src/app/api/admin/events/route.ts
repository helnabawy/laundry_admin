import { getSession } from "@/server/auth/session";
import { switcherVendorId } from "@/server/auth/scope";
import { subscribe } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events for the portal: new notifications and order changes in
 * the viewer's vendor scope — a super admin's switcher choice included (the
 * bell remounts, and so reconnects, when the switcher changes). The browser's
 * EventSource reconnects on its own.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const scopeVendorId = await switcherVendorId(session);

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
        if (scopeVendorId && event.vendorId !== scopeVendorId) return;
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
