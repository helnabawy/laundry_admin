import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { auth, CUSTOMER, mobileLogin, pickSlots, PASSWORD, staffLogin } from "./helpers";

/**
 * Roles × laundries (docs/ROLES.md): a super admin assigns a laundry admin to
 * several laundries and an operator to one; each sees only their laundries.
 */
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36).toUpperCase().slice(-5);
const B = `Bay Laundry ${run}`;
const C = `Creek Laundry ${run}`;
const ADMIN = `la-${run.toLowerCase()}@laundry.local`;
const OPERATOR = `op-${run.toLowerCase()}@laundry.local`;

type Vendor = { id: string; slug: string; name: string };
let vendors: Record<"main" | "b" | "c", Vendor>;
let orders: Record<"b" | "c", string>;

async function addLaundry(page: Page, name: string, slug: string, prefix: string) {
  await page.goto("/vendors");
  await page.getByRole("button", { name: "Add laundry" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Short ID").fill(slug);
  await dialog.getByLabel("Name (English)").fill(name);
  await dialog.getByLabel("Name (Arabic)").fill(`مغسلة ${slug}`);
  await dialog.getByLabel("Invoice number prefix").fill(prefix);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();
}

/** A customer's shop order at `vendor`; returns its id. */
async function placeOrder(request: APIRequestContext, vendor: Vendor) {
  const at = { "x-vendor-id": vendor.id };
  const customer = await mobileLogin(request, CUSTOMER);
  const products = await (await request.get("/api/products", { headers: at })).json();
  const tiers = await (await request.get("/api/service-tiers", { headers: at })).json();
  const tier = tiers.find((t: { isVip: boolean }) => !t.isVip);
  const slots = await pickSlots(request, tier.id, tier.deliveryHours, at);
  const created = await request.post("/api/orders", {
    headers: { ...auth(customer), ...at },
    data: { items: [{ productId: products[0].id, quantity: 1 }], paymentMethod: "cashOnDelivery", addressId: "adr-1", tierId: tier.id, ...slots },
  });
  expect(created.status()).toBe(201);
  return (await created.json()).id as string;
}

async function me(page: Page) {
  const res = await page.request.get("/api/admin/me");
  expect(res.status()).toBe(200);
  return res.json();
}

test("a super admin assigns a laundry admin to two laundries", async ({ page, request }) => {
  await staffLogin(page, "super@laundry.local");
  const sb = `b-${run.toLowerCase()}`;
  const sc = `c-${run.toLowerCase()}`;
  await addLaundry(page, B, sb, `B${run}`);
  await addLaundry(page, C, sc, `C${run}`);

  const list: Vendor[] = await (await request.get("/api/vendors")).json();
  vendors = {
    main: list.find((v) => v.slug === "main")!,
    b: list.find((v) => v.slug === sb)!,
    c: list.find((v) => v.slug === sc)!,
  };
  orders = { b: await placeOrder(request, vendors.b), c: await placeOrder(request, vendors.c) };

  // Super admin: platform-wide, nothing assigned.
  const sup = await me(page);
  expect(sup).toMatchObject({ role: "SUPER_ADMIN", assignedLaundryIds: null, activeLaundryId: null });
  expect(sup.capabilities).toContain("vendors.manage");

  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff member" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill(`Laundry Admin ${run}`);
  await dialog.getByLabel("Email").fill(ADMIN);
  await dialog.getByRole("radio", { name: /^Laundry admin/ }).check();
  // A laundry admin needs at least one laundry.
  for (const box of await dialog.getByRole("checkbox").all()) await box.uncheck();
  await dialog.getByLabel("Temporary password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Pick at least one laundry for a laundry admin.")).toBeVisible();

  await dialog.getByRole("checkbox", { name: vendors.main.name, exact: true }).check();
  await dialog.getByRole("checkbox", { name: B }).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(`Laundry Admin ${run} can now sign in`)).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: ADMIN });
  await expect(row).toContainText(vendors.main.name);
  await expect(row).toContainText(B);
  await expect(row).not.toContainText(C);
});

test("a laundry admin sees all of their laundries, and only those", async ({ page }) => {
  await staffLogin(page, ADMIN);
  const info = await me(page);
  expect(info.role).toBe("ADMIN");
  expect(info.activeLaundryId).toBeNull(); // starts on "All my laundries"
  expect(info.assignedLaundryIds.sort()).toEqual([vendors.main.id, vendors.b.id].sort());
  expect(info.laundries.map((l: { id: string }) => l.id).sort()).toEqual([vendors.main.id, vendors.b.id].sort());
  expect(info.capabilities).not.toContain("vendors.manage");

  // The switcher offers only their laundries.
  const switcher = page.getByRole("combobox", { name: "Laundry" }).first();
  await expect(switcher.locator("option")).toHaveText(["All my laundries", vendors.main.name, B]);

  // B's order opens; C's doesn't exist for them.
  expect((await page.goto(`/orders/${orders.b}`))?.status()).toBe(200);
  expect((await page.goto(`/orders/${orders.c}`))?.status()).toBe(404);

  // The dashboard compares their laundries, not every laundry.
  await page.goto("/dashboard");
  const table = page.getByRole("table", { name: "Laundries side by side" });
  await expect(table.getByRole("rowheader", { name: B })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: C })).toHaveCount(0);

  // Narrowing to Main hides B's order from the list.
  await page.goto("/orders?view=list");
  await page.getByRole("combobox", { name: "Laundry" }).first().selectOption(vendors.main.id);
  await expect.poll(async () => (await me(page)).activeLaundryId).toBe(vendors.main.id);

  // A forged switcher cookie for C is ignored: back to all of theirs.
  await page.context().addCookies([{ name: "laundry_admin_vendor", value: vendors.c.id, url: "http://localhost:3000" }]);
  expect((await me(page)).activeLaundryId).toBeNull();
  expect((await page.goto(`/orders/${orders.c}`))?.status()).toBe(404);
});

test("a laundry admin adds an operator to one of their laundries", async ({ page }) => {
  await staffLogin(page, ADMIN);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff member" }).click();
  const dialog = page.getByRole("dialog");
  // They can only create operators.
  await expect(dialog.getByRole("radio")).toHaveCount(1);
  await expect(dialog.getByRole("radio", { name: /^Laundry operator/ })).toBeChecked();
  await expect(dialog.getByLabel("Laundry", { exact: true }).locator("option")).toHaveText([vendors.main.name, B]);
  await dialog.getByLabel("Full name").fill(`Operator ${run}`);
  await dialog.getByLabel("Email").fill(OPERATOR);
  await dialog.getByLabel("Laundry", { exact: true }).selectOption(vendors.b.id);
  await dialog.getByLabel("Temporary password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(`Operator ${run} can now sign in`)).toBeVisible();

  // Their own row (an admin) is listed but not editable; the super admin isn't listed.
  await expect(page.getByRole("row").filter({ hasText: OPERATOR }).getByRole("button", { name: "Edit staff member" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: ADMIN }).getByRole("button", { name: "Edit staff member" })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "super@laundry.local" })).toHaveCount(0);
});

test("an operator works in exactly one laundry", async ({ page }) => {
  await staffLogin(page, OPERATOR);
  expect(await me(page)).toMatchObject({ role: "USER", assignedLaundryIds: [vendors.b.id], activeLaundryId: vendors.b.id });
  await expect(page.getByRole("combobox", { name: "Laundry" })).toHaveCount(0);
  expect((await page.goto(`/orders/${orders.b}`))?.status()).toBe(200);
  expect((await page.goto(`/orders/${orders.c}`))?.status()).toBe(404);
});

test("removing a laundry from an admin takes effect immediately", async ({ page, browser }) => {
  // The admin is signed in in another browser while the super admin edits them.
  const adminPage = await (await browser.newContext()).newPage();
  await staffLogin(adminPage, ADMIN);
  expect((await adminPage.goto(`/orders/${orders.b}`))?.status()).toBe(200);

  await staffLogin(page, "super@laundry.local");
  await page.goto("/staff");
  await page.getByRole("row").filter({ hasText: ADMIN }).getByRole("button", { name: "Edit staff member" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: B }).uncheck();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("row").filter({ hasText: ADMIN })).not.toContainText(B);

  expect((await adminPage.goto(`/orders/${orders.b}`))?.status()).toBe(404);
  const info = await me(adminPage);
  expect(info.assignedLaundryIds).toEqual([vendors.main.id]);
  expect(info.activeLaundryId).toBe(vendors.main.id);
  await adminPage.context().close();
});
