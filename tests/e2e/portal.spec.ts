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

  await staffLogin(page, "super@laundry.local");
  await expect(nav.getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit log" })).toBeVisible();
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
