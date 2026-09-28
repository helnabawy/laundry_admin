"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/server/auth/session";
import {
  assignPickupDriver,
  cancelOrder,
  issueInvoice,
  markCleaned,
  receiveFromDriver,
  retryDelivery,
  type InvoiceInput,
} from "@/server/orders/staff";
import { storeImage } from "@/server/storage";
import { run } from "./result";

function done(orderId: string) {
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/dashboard");
}

const actor = (s: { userId: string; vendorId: string | null }) => ({ userId: s.userId, vendorId: s.vendorId });

export async function assignPickupDriverAction(orderId: string, driverId: string) {
  return run(async () => {
    const s = await requireCapability("orders.operate");
    await assignPickupDriver(actor(s), orderId, driverId);
    done(orderId);
  });
}

export async function receiveFromDriverAction(orderId: string) {
  return run(async () => {
    const s = await requireCapability("orders.operate");
    const o = await receiveFromDriver(actor(s), orderId);
    done(orderId);
    return o.status;
  });
}

export async function issueInvoiceAction(orderId: string, input: InvoiceInput) {
  return run(async () => {
    const s = await requireCapability("orders.operate");
    await issueInvoice(actor(s), orderId, input);
    done(orderId);
  });
}

export async function markCleanedAction(orderId: string, driverId: string) {
  return run(async () => {
    const s = await requireCapability("orders.operate");
    await markCleaned(actor(s), orderId, driverId);
    done(orderId);
  });
}

export async function retryDeliveryAction(orderId: string, driverId: string) {
  return run(async () => {
    const s = await requireCapability("orders.operate");
    await retryDelivery(actor(s), orderId, driverId);
    done(orderId);
  });
}

export async function cancelOrderAction(orderId: string, reason: string) {
  return run(async () => {
    const s = await requireCapability("orders.cancel");
    await cancelOrder(actor(s), orderId, reason);
    done(orderId);
  });
}

/** Condition-report photo upload; returns the stored path. */
export async function uploadConditionPhotoAction(form: FormData) {
  return run(async () => {
    await requireCapability("orders.operate");
    return storeImage(form.get("file"), "conditions");
  });
}
