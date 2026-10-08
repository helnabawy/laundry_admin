import { expect, test } from "@playwright/test";
import { auth, CUSTOMER, mobileLogin, pickSlots, staffLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

// Unique per run, so the spec can run against an already-used database.
const run = Date.now().toString(36).toUpperCase().slice(-5);
const SLUG = `e2e-${run.toLowerCase()}`;
const PREFIX = `E${run}`;
const NAME = `Marina Laundry ${run}`;

test("a super admin adds a laundry, and the app can order from it", async ({ page, request }) => {
  // Super admin adds a second laundry, starting from Main's services.
  await staffLogin(page, "super@laundry.local");
  await page.goto("/vendors");
  await page.getByRole("button", { name: "Add laundry" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Short ID").fill(SLUG);
  await dialog.getByLabel("Name (English)").fill(NAME);
  await dialog.getByLabel("Name (Arabic)").fill(`مغسلة المارينا ${run}`);
  await dialog.getByLabel("City").fill("Abu Dhabi");
  await dialog.getByLabel("Area").fill("Al Marina");

  // Invoice prefixes must not repeat across laundries.
  await dialog.getByLabel("Invoice number prefix").fill("INV");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Another laundry already uses this invoice prefix.")).toBeVisible();
  await dialog.getByLabel("Invoice number prefix").fill(PREFIX);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(`${NAME} added.`)).toBeVisible();

  // The app lists both laundries.
  const vendors = await (await request.get("/api/vendors")).json();
  const marina = vendors.find((v: { slug: string }) => v.slug === SLUG);
  expect(marina).toMatchObject({ name: NAME, city: "Abu Dhabi", area: "Al Marina", codFee: 5 });
  expect(vendors.length).toBeGreaterThan(1);
  const atMarina = { "x-vendor-id": marina.id };

  // Its catalogue is a copy with its own ids; Main's is untouched.
  const mainProducts = await (await request.get("/api/products")).json();
  const marinaProducts = await (await request.get("/api/products", { headers: atMarina })).json();
  expect(marinaProducts.length).toBe(mainProducts.length);
  expect(marinaProducts.map((p: { name: string }) => p.name).sort()).toEqual(mainProducts.map((p: { name: string }) => p.name).sort());
  const mainIds = new Set(mainProducts.map((p: { id: string }) => p.id));
  expect(marinaProducts.some((p: { id: string }) => mainIds.has(p.id))).toBe(false);

  // An unknown laundry is a 404, never a silent fallback.
  expect((await request.get("/api/products", { headers: { "x-vendor-id": "nope" } })).status()).toBe(404);

  // The customer orders from the new laundry: Main's tier is rejected…
  const customer = await mobileLogin(request, CUSTOMER);
  const tiers = await (await request.get("/api/service-tiers", { headers: atMarina })).json();
  const tier = tiers.find((t: { isVip: boolean }) => !t.isVip);
  const slots = await pickSlots(request, tier.id, tier.deliveryHours, atMarina);
  const shirt = marinaProducts.find((p: { name: string }) => p.name === "Shirt") ?? marinaProducts[0];
  const body = { items: [{ productId: shirt.id, quantity: 2 }], paymentMethod: "card", addressId: "adr-1", ...slots };
  const wrongTier = await request.post("/api/orders", {
    headers: { ...auth(customer), ...atMarina },
    data: { ...body, tierId: "tier-standard" },
  });
  expect(wrongTier.ok()).toBe(false);

  // …its own tier works, and the order (and invoice) belong to it.
  const created = await request.post("/api/orders", { headers: { ...auth(customer), ...atMarina }, data: { ...body, tierId: tier.id } });
  expect(created.status()).toBe(201);
  const order = await created.json();
  expect(order.vendor).toMatchObject({ id: marina.id, name: NAME });
  expect(order.invoice.id).toMatch(new RegExp(`^${PREFIX}-`));

  // Main's admin can't open the other laundry's order.
  await staffLogin(page, "admin@laundry.local");
  const res = await page.goto(`/orders/${order.id}`);
  expect(res?.status()).toBe(404);

  // The super admin's dashboard compares the laundries.
  await staffLogin(page, "super@laundry.local");
  await page.goto("/dashboard");
  const table = page.getByRole("table", { name: "Laundries side by side" });
  await expect(table.getByRole("rowheader", { name: NAME })).toBeVisible();
});

test("the app registers and removes its push token", async ({ request }) => {
  const customer = await mobileLogin(request, CUSTOMER);
  const token = `e2e-token-${run}-${"x".repeat(20)}`;
  const add = await request.post("/api/me/devices", { headers: auth(customer, "ar"), data: { token, platform: "android" } });
  expect(add.status()).toBe(204);
  const again = await request.post("/api/me/devices", { headers: auth(customer), data: { token, platform: "android" } });
  expect(again.status()).toBe(204);
  const remove = await request.delete("/api/me/devices", { headers: auth(customer), data: { token } });
  expect(remove.status()).toBe(204);
  expect((await request.post("/api/me/devices", { data: { token, platform: "android" } })).status()).toBe(401);
});
