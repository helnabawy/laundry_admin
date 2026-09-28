import { expect, test } from "@playwright/test";
import { auth, CUSTOMER, DRIVER, DRIVER_NAME, mobileLogin, pickSlots, staffLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

test("quick (wizard) order: app → laundry → app, end to end", async ({ page, request }) => {
  const customer = await mobileLogin(request, CUSTOMER);
  const driver = await mobileLogin(request, DRIVER);

  // Customer books a quick order in the app.
  const slots = await pickSlots(request, "tier-standard", 48);
  const created = await request.post("/api/orders", {
    headers: auth(customer),
    data: { lines: [{ categoryId: "cat-clothes", subServiceId: "sub-wash-iron" }], tierId: "tier-standard", addressId: "adr-1", ...slots },
  });
  expect(created.status()).toBe(201);
  const order = await created.json();
  expect(order.status).toBe("pending");
  expect(order.invoice).toBeNull();

  // Operator assigns the pickup driver.
  await staffLogin(page, "operator@laundry.local");
  await page.goto(`/orders/${order.id}`);
  await page.getByRole("button", { name: "Assign pickup driver" }).click();
  await page.getByRole("radio", { name: new RegExp(DRIVER_NAME) }).check();
  await page.getByRole("button", { name: "Assign driver" }).click();
  await expect(page.getByText(/will collect order/)).toBeVisible();

  // Driver sees the pickup and confirms it.
  const tasks = await (await request.get("/api/driver/tasks?status=today", { headers: auth(driver) })).json();
  expect(tasks.some((t: { type: string; order: { id: string } }) => t.type === "pickup" && t.order.id === order.id)).toBe(true);
  const picked = await request.post(`/api/driver/tasks/${order.id}/confirm-pickup`, { headers: auth(driver) });
  expect((await picked.json()).status).toBe("pickedUp");

  // Laundry receives the bags → At the laundry.
  await page.reload();
  await page.getByRole("button", { name: "Receive items" }).click();
  await expect(page.getByText("The order moves to Count & invoice.")).toBeVisible();
  await page.getByRole("button", { name: "Items received" }).click();
  await expect(page.getByRole("link", { name: "Count & invoice" })).toBeVisible();

  // Count, price and record a stain, then issue.
  await page.getByRole("link", { name: "Count & invoice" }).click();
  await expect(page).toHaveURL(/\/invoice$/);
  await expect(page.getByRole("button", { name: "Issue invoice" })).toBeDisabled();
  const shirt = page.getByRole("group", { name: "Shirt", exact: true });
  for (let i = 0; i < 3; i++) await shirt.getByRole("button", { name: "One more" }).click();
  await page.getByRole("button", { name: "Add a finding" }).click();
  await page.getByLabel("Item", { exact: true }).fill("Shirt");
  await page.getByLabel("What you found").fill("Ink on the cuff");
  await expect(page.getByText("1 finding will be shown before payment")).toBeVisible();
  await page.getByRole("button", { name: "Issue invoice" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Issue invoice" }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.getByText("Ink on the cuff")).toBeVisible();

  // Customer sees the invoice with the condition report and pays on delivery.
  const withInvoice = await (await request.get(`/api/orders/${order.id}`, { headers: auth(customer) })).json();
  expect(withInvoice.status).toBe("awaitingPayment");
  expect(withInvoice.invoice.items[0]).toMatchObject({ name: "Shirt", quantity: 3, unitPrice: 10 });
  expect(withInvoice.invoice.conditions).toHaveLength(1);
  const refused = await request.post(`/api/orders/${order.id}/payment-method`, {
    headers: auth(customer),
    data: { method: "cashOnDelivery", conditionsAcknowledged: false },
  });
  expect(refused.status()).toBe(400);
  const paying = await request.post(`/api/orders/${order.id}/payment-method`, {
    headers: auth(customer),
    data: { method: "cashOnDelivery", conditionsAcknowledged: true },
  });
  const afterPay = await paying.json();
  expect(afterPay.status).toBe("processing");
  expect(afterPay.invoice).toMatchObject({ paymentMethod: "cashOnDelivery", codFee: 5, paid: false });

  // Laundry finishes cleaning and dispatches.
  await page.reload();
  await page.getByRole("button", { name: "Cleaning done: send out" }).click();
  await page.getByRole("radio", { name: new RegExp(DRIVER_NAME) }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Send out" }).click();
  await expect(page.getByText(/is out for delivery with/)).toBeVisible();

  // Driver delivers, collecting cash.
  const form = { cashCollected: "true" };
  const noCash = await request.post(`/api/driver/tasks/${order.id}/confirm-delivery`, {
    headers: auth(driver),
    multipart: { cashCollected: "false" },
  });
  expect(noCash.status()).toBe(400);
  const delivered = await (
    await request.post(`/api/driver/tasks/${order.id}/confirm-delivery`, { headers: auth(driver), multipart: form })
  ).json();
  expect(delivered.status).toBe("delivered");
  expect(delivered.invoice.paid).toBe(true);
  expect(delivered.timeline.map((e: { status: string }) => e.status)).toEqual([
    "pending",
    "driverAssigned",
    "pickedUp",
    "atFacility",
    "awaitingPayment",
    "processing",
    "outForDelivery",
    "delivered",
  ]);

  // The customer's inbox has the invoice notification.
  const inbox = await (await request.get("/api/me/notifications", { headers: auth(customer) })).json();
  expect(inbox.some((n: { kind: string; orderId: string }) => n.kind === "invoiceReady" && n.orderId === order.id)).toBe(true);
});

test("shop order skips inspection: receiving starts cleaning", async ({ page, request }) => {
  const customer = await mobileLogin(request, CUSTOMER);
  const driver = await mobileLogin(request, DRIVER);
  const slots = await pickSlots(request, "tier-vip", 24);
  const created = await request.post("/api/orders", {
    headers: auth(customer, "ar"),
    data: {
      items: [{ productId: "prod-shirt", quantity: 3 }, { productId: "prod-suit", quantity: 1 }],
      tierId: "tier-vip",
      paymentMethod: "card",
      addressId: "adr-1",
      ...slots,
    },
  });
  const order = await created.json();
  // 3×10 + 45 = 75, VIP 15% = 11.25, card → no COD fee, paid.
  expect(order.invoice).toMatchObject({ vipSurcharge: 11.25, codFee: 0, paid: true });
  expect(order.invoice.items[0].name).toBe("قميص");

  await staffLogin(page, "admin@laundry.local");
  await page.goto(`/orders/${order.id}`);
  await page.getByRole("button", { name: "Assign pickup driver" }).click();
  await page.getByRole("radio", { name: new RegExp(DRIVER_NAME) }).check();
  await page.getByRole("button", { name: "Assign driver" }).click();
  await expect(page.getByText(/will collect order/)).toBeVisible();
  await request.post(`/api/driver/tasks/${order.id}/confirm-pickup`, { headers: auth(driver) });

  await page.reload();
  await page.getByRole("button", { name: "Receive items" }).click();
  await expect(page.getByText(/already paid for, so cleaning starts now/)).toBeVisible();
  await page.getByRole("button", { name: "Items received" }).click();
  await expect(page.getByRole("button", { name: "Cleaning done: send out" })).toBeVisible();

  const now = await (await request.get(`/api/orders/${order.id}`, { headers: auth(customer) })).json();
  expect(now.status).toBe("processing");
  expect(now.timeline.map((e: { status: string }) => e.status)).not.toContain("atFacility");
});

test("an operator cannot cancel; an admin can, with a reason", async ({ page, request }) => {
  const customer = await mobileLogin(request, CUSTOMER);
  const slots = await pickSlots(request, "tier-standard", 48);
  const order = await (
    await request.post("/api/orders", {
      headers: auth(customer),
      data: { lines: [{ categoryId: "cat-carpets", subServiceId: "sub-carpet-deep" }], tierId: "tier-standard", addressId: "adr-2", ...slots },
    })
  ).json();

  await staffLogin(page, "operator@laundry.local");
  await page.goto(`/orders/${order.id}`);
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);

  await staffLogin(page, "admin@laundry.local");
  await page.goto(`/orders/${order.id}`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel order" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Customer called to cancel");
  await dialog.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByText("Cancelled: Customer called to cancel")).toBeVisible();

  const after = await (await request.get(`/api/orders/${order.id}`, { headers: auth(customer) })).json();
  expect(after.status).toBe("cancelled");
});
