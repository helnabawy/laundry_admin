import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { auth, CUSTOMER, DRIVER, DRIVER_NAME, gatewayWebhook, mobileLogin, pickSlots, staffLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

/** Books a quick order and walks it to `awaitingPayment` through the portal. */
async function wizardAwaitingPayment(page: Page, request: APIRequestContext, customer: string, driver: string) {
  const slots = await pickSlots(request, "tier-standard", 48);
  const order = await (
    await request.post("/api/orders", {
      headers: auth(customer),
      data: { lines: [{ categoryId: "cat-clothes", subServiceId: "sub-wash-iron" }], tierId: "tier-standard", addressId: "adr-1", ...slots },
    })
  ).json();

  await staffLogin(page, "operator@laundry.local");
  await page.goto(`/orders/${order.id}`);
  await page.getByRole("button", { name: "Assign pickup driver" }).click();
  await page.getByRole("radio", { name: new RegExp(DRIVER_NAME) }).check();
  await page.getByRole("button", { name: "Assign driver" }).click();
  await expect(page.getByText(/will collect order/)).toBeVisible();
  await request.post(`/api/driver/tasks/${order.id}/confirm-pickup`, { headers: auth(driver) });
  await page.reload();
  await page.getByRole("button", { name: "Receive items" }).click();
  await page.getByRole("button", { name: "Items received" }).click();
  await page.getByRole("link", { name: "Count & invoice" }).click();
  const shirt = page.getByRole("group", { name: "Shirt", exact: true });
  for (let i = 0; i < 6; i++) await shirt.getByRole("button", { name: "One more" }).click();
  await page.getByRole("button", { name: "Add a finding" }).click();
  await page.getByLabel("Item", { exact: true }).fill("Shirt");
  await page.getByLabel("What you found").fill("Loose button");
  await page.getByRole("button", { name: "Issue invoice" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Issue invoice" }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  return order.id as string;
}

test("wizard card payment: decline, retry, pay on the hosted page", async ({ page, request }) => {
  const customer = await mobileLogin(request, CUSTOMER);
  const driver = await mobileLogin(request, DRIVER);
  const orderId = await wizardAwaitingPayment(page, request, customer, driver);

  // Choosing card opens a checkout; the order keeps waiting for the money.
  const chosen = await (
    await request.post(`/api/orders/${orderId}/payment-method`, {
      headers: auth(customer),
      data: { method: "card", conditionsAcknowledged: true },
    })
  ).json();
  expect(chosen.status).toBe("awaitingPayment");
  expect(chosen.invoice).toMatchObject({ paymentMethod: "card", codFee: 0, paid: false, total: 60 });
  expect(chosen.invoice.payment).toMatchObject({ status: "pending", provider: "networkIntl", amount: 60 });
  const first = chosen.invoice.payment;
  expect(first.checkoutUrl).toMatch(/\/pay\//);

  // The hosted page declines the card.
  await page.goto(new URL(first.checkoutUrl).pathname);
  await expect(page.getByText("N-Genius")).toBeVisible();
  await page.getByRole("button", { name: "Simulate decline" }).click();
  await expect(page.getByText("Payment declined")).toBeVisible();
  const declined = await (await request.get(`/api/payments/${first.id}`, { headers: auth(customer) })).json();
  expect(declined.status).toBe("failed");
  expect((await (await request.get(`/api/orders/${orderId}`, { headers: auth(customer) })).json()).status).toBe("awaitingPayment");

  // Retry opens a new checkout; paying it starts the cleaning.
  const retried = await (await request.post(`/api/orders/${orderId}/payments`, { headers: auth(customer), data: {} })).json();
  const second = retried.invoice.payment;
  expect(second.id).not.toBe(first.id);
  expect(second.status).toBe("pending");
  await page.goto(new URL(second.checkoutUrl).pathname);
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText("Payment complete")).toBeVisible();

  const paid = await (await request.get(`/api/orders/${orderId}`, { headers: auth(customer) })).json();
  expect(paid.status).toBe("processing");
  expect(paid.invoice).toMatchObject({ paid: true, paymentMethod: "card" });
  expect(paid.invoice.paidAt).toBeTruthy();
  expect(paid.invoice.payment).toMatchObject({ status: "succeeded", checkoutUrl: null });

  // Providers retry webhooks: a replay changes nothing.
  const replay = await gatewayWebhook(request, { provider: "networkIntl", reference: second.reference }, "succeeded");
  expect(await replay.json()).toMatchObject({ outcome: "duplicate" });
  // A forged webhook is rejected.
  const forged = await request.post("/api/payments/webhooks/networkIntl", {
    headers: { "content-type": "application/json", "x-mock-signature": "nope" },
    data: JSON.stringify({ provider: "networkIntl", reference: second.reference, event: "succeeded" }),
  });
  expect(forged.status()).toBe(401);

  // Retrying a paid order is refused.
  expect((await request.post(`/api/orders/${orderId}/payments`, { headers: auth(customer), data: {} })).status()).toBe(400);
});

test("shop pay-later: no driver until Tabby confirms; limits enforced", async ({ page, request }) => {
  const customer = await mobileLogin(request, CUSTOMER);
  const slots = await pickSlots(request, "tier-standard", 48);

  // Tabby's minimum is AED 50 in the seed: a AED 10 basket can't use it.
  const tooSmall = await request.post("/api/orders", {
    headers: auth(customer),
    data: { items: [{ productId: "prod-shirt", quantity: 1 }], tierId: "tier-standard", paymentMethod: "payLater", addressId: "adr-1", ...slots },
  });
  expect(tooSmall.status()).toBe(400);

  const options = await (await request.get("/api/payment-options", { headers: auth(customer) })).json();
  expect(options.map((o: { method: string }) => o.method)).toEqual(["card", "payLater", "cashOnDelivery"]);

  const order = await (
    await request.post("/api/orders", {
      headers: auth(customer),
      data: {
        items: [{ productId: "prod-shirt", quantity: 3 }, { productId: "prod-suit", quantity: 1 }],
        tierId: "tier-standard",
        paymentMethod: "payLater",
        addressId: "adr-1",
        ...slots,
      },
    })
  ).json();
  expect(order.invoice.payment).toMatchObject({ status: "pending", provider: "tabby", method: "payLater", amount: 75 });

  await staffLogin(page, "operator@laundry.local");
  await page.goto(`/orders/${order.id}`);
  await page.getByRole("button", { name: "Assign pickup driver" }).click();
  await page.getByRole("radio", { name: new RegExp(DRIVER_NAME) }).check();
  await page.getByRole("button", { name: "Assign driver" }).click();
  await expect(page.getByText(/waiting for its online payment/)).toBeVisible();

  await page.goto(new URL(order.invoice.payment.checkoutUrl).pathname);
  await expect(page.getByText("4 interest-free payments of AED 18.75")).toBeVisible();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText("Payment complete")).toBeVisible();

  await page.goto(`/orders/${order.id}`);
  await page.getByRole("button", { name: "Assign pickup driver" }).click();
  await page.getByRole("radio", { name: new RegExp(DRIVER_NAME) }).check();
  await page.getByRole("button", { name: "Assign driver" }).click();
  await expect(page.getByText(/will collect order/)).toBeVisible();

  const inbox = await (await request.get("/api/me/notifications", { headers: auth(customer) })).json();
  expect(inbox.some((n: { kind: string; orderId: string }) => n.kind === "paymentReceived" && n.orderId === order.id)).toBe(true);
});
