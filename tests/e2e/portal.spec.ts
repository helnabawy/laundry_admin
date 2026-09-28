import { expect, test } from "@playwright/test";
import { staffLogin } from "./helpers";

test("navigation follows the role", async ({ page }) => {
  await staffLogin(page, "operator@laundry.local");
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Services & prices" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Reports" })).toHaveCount(0);
  await page.goto("/catalogue");
  await expect(page).toHaveURL(/\/dashboard/);

  await staffLogin(page, "admin@laundry.local");
  await expect(nav.getByRole("link", { name: "Services & prices" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Reports" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/dashboard/);

  await staffLogin(page, "super@laundry.local");
  await expect(nav.getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit log" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Staff" })).toBeVisible();
});

test("an admin adds a bilingual service with an icon, and the app sees it", async ({ page, request }) => {
  await staffLogin(page, "admin@laundry.local");
  await page.goto("/catalogue/categories/new");
  const stamp = Date.now().toString().slice(-5);
  await page.getByLabel("Name (English)").fill(`Shoes ${stamp}`);
  await page.getByLabel("Name (Arabic)").fill(`أحذية ${stamp}`);
  await page.getByLabel("Description (English)").fill("Cleaning & polish");
  await page.getByLabel("Description (Arabic)").fill("تنظيف وتلميع");
  await page.getByText("Shoes", { exact: true }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/catalogue\/categories\/c/);

  const en = await (await request.get("/api/service-categories", { headers: { "accept-language": "en" } })).json();
  const ar = await (await request.get("/api/service-categories", { headers: { "accept-language": "ar" } })).json();
  expect(en.find((c: { name: string }) => c.name === `Shoes ${stamp}`)).toMatchObject({ iconKey: "shoe" });
  expect(ar.some((c: { name: string }) => c.name === `أحذية ${stamp}`)).toBe(true);
});

test("super admin exports the report", async ({ page }) => {
  await staffLogin(page, "super@laundry.local");
  await page.goto("/reports");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^laundry-requests_.*\.csv$/);
});

test("Arabic, right to left, in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await staffLogin(page, "admin@laundry.local");
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "ar", url: "http://localhost:3000" }]);
  for (const path of ["/orders", "/dashboard", "/catalogue", "/orders?view=list"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveClass(/dark/);
    // next-intl renders the key path when a message is missing.
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/\b(orders|stage|status|dashboard|catalogue|common)\.[a-zA-Z]+/);
  }
  await expect(page.getByRole("heading", { name: "الطلبات" })).toBeVisible();
});

test("an admin blocks an app user, who then can't sign in; unblocking restores it", async ({ page, request }) => {
  const phone = "+971501234567";
  await staffLogin(page, "admin@laundry.local");
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  await nav.getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  await page.getByPlaceholder("Name or mobile number").fill("501234567");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("link", { name: "خالد المنصوري" }).click();
  await expect(page.getByText("Recent orders")).toBeVisible();

  await page.getByRole("button", { name: "Block user" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Block user" }).click();
  await expect(page.getByText("This user is blocked.", { exact: false })).toBeVisible();

  await request.post("/api/auth/request-otp", { data: { phone } });
  const refused = await request.post("/api/auth/verify-otp", { data: { phone, code: "1234" } });
  expect(refused.status()).toBe(403);
  // A blocked account doesn't count as registered.
  expect(await (await request.post("/api/auth/lookup", { data: { phone } })).json()).toEqual({ registered: false });

  await page.getByRole("button", { name: "Unblock" }).click();
  await expect(page.getByText("This user is blocked.", { exact: false })).toHaveCount(0);
  expect(await (await request.post("/api/auth/lookup", { data: { phone } })).json()).toEqual({ registered: true });
  await request.post("/api/auth/request-otp", { data: { phone } });
  expect((await request.post("/api/auth/verify-otp", { data: { phone, code: "1234" } })).ok()).toBe(true);
});

test("operators don't see app users", async ({ page }) => {
  await staffLogin(page, "operator@laundry.local");
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  await page.goto("/users");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("the super admin sees every app user: customers and drivers", async ({ page }) => {
  await staffLogin(page, "super@laundry.local");
  await page.goto("/users");
  await expect(page.getByRole("columnheader", { name: "Role" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Driver" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Customer" }).first()).toBeVisible();

  await page.goto("/users?role=driver");
  await expect(page.getByRole("cell", { name: "Customer" })).toHaveCount(0);
  await page.getByRole("link", { name: "أحمد علي" }).click();
  await expect(page.getByText("Recent pickups and deliveries")).toBeVisible();
});
