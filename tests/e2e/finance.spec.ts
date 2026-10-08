import { expect, test, type Page } from "@playwright/test";
import { auth, CUSTOMER, gatewayWebhook, mobileLogin, pickSlots, staffLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

// Unique per run, so reruns against the same database don't collide.
const NOTE = `E2E fuel top-up ${Date.now().toString(36)}`;

/**
 * The statement's rows. Other clients may take payments while this runs, so
 * tests compare the rows only they move (refunds, expenses) and check that
 * the statement adds up, rather than pinning revenue.
 */
async function statement(page: Page) {
  const [gross, refunds, net, fees, expenses, profit] = await Promise.all(
    ["Payments taken", "Refunds", "Net revenue", "Provider fees", "Expenses", "Net profit"].map((l) => statementValue(page, l)),
  );
  // Costs are shown with a minus sign.
  const s = { gross, refunds: Math.abs(refunds), net, fees: Math.abs(fees), expenses: Math.abs(expenses), profit };
  expect(s.net).toBeCloseTo(s.gross - s.refunds, 2);
  expect(s.profit).toBeCloseTo(s.net - s.fees - s.expenses, 2);
  return s;
}

/** The statement's value for a row label, as a number of AED. */
async function statementValue(page: Page, label: string): Promise<number> {
  const row = page.locator("dl > div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).first();
  const text = (await row.locator("dd").innerText()).replace(/[^\d.\-−]/g, "").replace("−", "-");
  return Number(text);
}

test("refunds and expenses move the owner's profit", async ({ page, request }) => {
  // A paid card order to refund.
  const customer = await mobileLogin(request, CUSTOMER);
  const slots = await pickSlots(request, "tier-standard", 48);
  const order = await (
    await request.post("/api/orders", {
      headers: auth(customer),
      data: { items: [{ productId: "prod-suit", quantity: 2 }], tierId: "tier-standard", paymentMethod: "card", addressId: "adr-1", ...slots },
    })
  ).json();
  expect((await gatewayWebhook(request, order.invoice.payment, "succeeded")).ok()).toBeTruthy();

  // Operators don't see the money.
  await staffLogin(page, "operator@laundry.local");
  await page.goto("/finance");
  await expect(page).toHaveURL(/\/dashboard/);

  await staffLogin(page, "admin@laundry.local");
  await page.goto("/finance?range=7");
  // The card payment of AED 90 already counts here, fee included.
  const before = await statement(page);

  // Partial refund, then the rest; never more than what was paid (90).
  await page.goto(`/orders/${order.id}`);
  await expect(page.getByText(/^N-Genius/).first()).toBeVisible();
  await page.getByRole("button", { name: "Refund" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount to refund (AED)").fill("100");
  await dialog.getByLabel("Reason").fill("Late delivery");
  await expect(dialog.getByRole("button", { name: /^Refund/ })).toBeDisabled();
  await dialog.getByLabel("Amount to refund (AED)").fill("30");
  await dialog.getByRole("button", { name: "Refund AED 30" }).click();
  await expect(page.getByText("Refunded AED 30.")).toBeVisible();
  await expect(page.getByText("Part refunded")).toBeVisible();

  await page.getByRole("button", { name: "Refund" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Amount to refund (AED)")).toHaveValue("60");
  await dialog.getByLabel("Reason").fill("Customer unhappy");
  await dialog.getByRole("button", { name: "Refund AED 60" }).click();
  await expect(page.getByText("Refunded AED 60.")).toBeVisible();
  await expect(page.getByText("Refunded", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund" })).toHaveCount(0);

  // The customer is told.
  const after = await (await request.get(`/api/orders/${order.id}`, { headers: auth(customer) })).json();
  expect(after.invoice).toMatchObject({ amountRefunded: 90 });
  expect(after.invoice.payment.status).toBe("refunded");

  // The 90 taken (already counted above) went back; the provider keeps its
  // fee, charged when the card was paid.
  await page.goto("/finance?range=7");
  const refunded = await statement(page);
  expect(refunded.refunds).toBeCloseTo(before.refunds + 90, 2);
  expect(refunded.fees).toBeGreaterThanOrEqual(before.fees);

  // An expense today lowers profit by exactly its amount; deleting restores it.
  await page.goto("/finance/expenses?range=7");
  await page.getByRole("button", { name: "Add expense" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Category").selectOption("fuel");
  await dialog.getByLabel("Amount (AED)").fill("123.45");
  await dialog.getByLabel("Description").fill(NOTE);
  await dialog.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Expense added.")).toBeVisible();
  await expect(page.getByRole("cell", { name: NOTE })).toBeVisible();

  await page.goto("/finance?range=7");
  expect((await statement(page)).expenses).toBeCloseTo(refunded.expenses + 123.45, 2);

  await page.goto("/finance/expenses?range=7");
  await page.getByRole("row", { name: new RegExp(NOTE) }).getByRole("button", { name: "Delete expense" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete expense" }).click();
  await expect(page.getByText("Expense deleted.")).toBeVisible();
  await page.goto("/finance?range=7");
  expect((await statement(page)).expenses).toBeCloseTo(refunded.expenses, 2);

  // The ledger lists the payment; the export downloads.
  await page.goto(`/finance/payments?range=7&status=refunded`);
  await expect(page.getByRole("link", { name: String(order.number) })).toBeVisible();
  const xlsx = await page.request.get("/api/admin/finance/export?dataset=pnl&format=xlsx&range=7");
  expect(xlsx.ok()).toBeTruthy();
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
});

test("provider settings: switching Tabby off hides it from the app", async ({ page, request }) => {
  await staffLogin(page, "admin@laundry.local");
  await page.goto("/finance/settings");
  const tabby = page.getByRole("switch", { name: "Tabby: On" });
  await expect(tabby).toBeChecked();
  await tabby.click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Payment settings saved.")).toBeVisible();

  const customer = await mobileLogin(request, CUSTOMER);
  let options = await (await request.get("/api/payment-options", { headers: auth(customer) })).json();
  expect(options.map((o: { method: string }) => o.method)).toEqual(["card", "cashOnDelivery"]);

  await page.reload();
  await page.getByRole("switch", { name: "Tabby: On" }).click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Payment settings saved.")).toBeVisible();
  options = await (await request.get("/api/payment-options", { headers: auth(customer) })).json();
  expect(options.map((o: { method: string }) => o.method)).toContain("payLater");
});
