/**
 * Sends one order push to a mobile user's devices through the real sender,
 * to check Firebase setup without walking an order through its statuses.
 *
 *   pnpm push:test <phone-or-mobileUserId> [kind]
 *
 * `kind` is any mobile notification kind (default `pickedUp`). The push is
 * about the user's latest order, so tapping it opens that order in the app.
 * Prints one line per device: `ok` or FCM's error code.
 */
import "dotenv/config";
import { db } from "@/server/db";
import { pushDriverName, sendOrderPushes } from "@/server/push";

async function main() {
  const [who, kind = "pickedUp"] = process.argv.slice(2);
  if (!who) throw new Error("usage: push:test <phone-or-mobileUserId> [kind]");
  const user = await db.mobileUser.findFirst({ where: { OR: [{ id: who }, { phone: who }] } });
  if (!user) throw new Error(`no mobile user with id or phone ${who}`);

  const devices = await db.deviceToken.count({ where: { mobileUserId: user.id } });
  console.log(`${user.phone} (${user.role}): ${devices} device(s)`);
  if (!devices) throw new Error("no registered devices — sign in on the app and allow notifications first");
  if ((await pushDriverName()) === "log") {
    console.log("FIREBASE_SERVICE_ACCOUNT_JSON is unset: the push is only logged, not sent");
  }

  const order = await db.order.findFirst({
    where: user.role === "driver" ? { OR: [{ pickupDriverId: user.id }, { deliveryDriverId: user.id }] } : { customerId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const results = await sendOrderPushes([
    {
      mobileUserId: user.id,
      kind,
      orderId: order?.id ?? "push-test",
      orderNumber: order?.number ?? 0,
      vendorId: order?.vendorId ?? user.vendorId ?? "",
      status: order?.status ?? "pushTest",
    },
  ]);
  for (const r of results) console.log(`${r.token.slice(0, 16)}…  ${r.error ?? "ok"}`);
  if (!results.length || results.some((r) => r.error)) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    // The realtime bus may hold a LISTEN connection open.
    setTimeout(() => process.exit(), 50).unref();
  });
