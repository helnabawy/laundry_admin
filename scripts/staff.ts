/**
 * The laundry's side of an order, from the command line: runs the same
 * services the portal's buttons call, as a seeded staff account.
 *
 *   pnpm staff assign   <orderId> <driverId>
 *   pnpm staff receive  <orderId>
 *   pnpm staff invoice  <orderId> '<items json>' ['<conditions json>']
 *   pnpm staff dispatch <orderId> <driverId>
 *   pnpm staff retry    <orderId> <driverId>
 *   pnpm staff cancel   <orderId> <reason>
 *
 * Prints the order's new status as JSON. Used by the mobile app's live API
 * tests (laundry_app/test/api_live) and handy for local demos.
 */
import "dotenv/config";
import { db } from "@/server/db";
import {
  assignPickupDriver,
  cancelOrder,
  issueInvoice,
  markCleaned,
  receiveFromDriver,
  retryDelivery,
} from "@/server/orders/staff";

async function main() {
  const [action, orderId, arg, arg2] = process.argv.slice(2);
  if (!action || !orderId) throw new Error("usage: staff <action> <orderId> [args]");
  const email = process.env.STAFF_EMAIL ?? "operator@laundry.local";
  const user = await db.staffUser.findUniqueOrThrow({ where: { email } });
  const staff = { userId: user.id, vendorId: user.vendorId };

  const order = await (() => {
    switch (action) {
      case "assign":
        return assignPickupDriver(staff, orderId, arg);
      case "receive":
        return receiveFromDriver(staff, orderId);
      case "invoice":
        return issueInvoice(staff, orderId, {
          items: JSON.parse(arg),
          conditions: arg2 ? JSON.parse(arg2) : [],
          noFindingsConfirmed: !arg2,
        });
      case "dispatch":
        return markCleaned(staff, orderId, arg);
      case "retry":
        return retryDelivery(staff, orderId, arg);
      case "cancel":
        return cancelOrder(staff, orderId, arg ?? "Cancelled from the CLI");
      default:
        throw new Error(`unknown action: ${action}`);
    }
  })();
  console.log(JSON.stringify({ ok: true, status: order.status }));
}

main()
  .catch((e) => {
    console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    // The realtime bus may hold a LISTEN connection open.
    setTimeout(() => process.exit(), 50).unref();
  });
