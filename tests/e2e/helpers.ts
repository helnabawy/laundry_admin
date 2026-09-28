import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "ChangeMe123!";
export const CUSTOMER = "+971501234567";
export const DRIVER = "+971500000001";
export const DRIVER_NAME = "أحمد علي";

export async function staffLogin(page: Page, email: string) {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: "http://localhost:3000" }]);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/orders/);
}

export async function mobileLogin(request: APIRequestContext, phone: string): Promise<string> {
  const r1 = await request.post("/api/auth/request-otp", { data: { phone } });
  expect(r1.status()).toBe(204);
  const r2 = await request.post("/api/auth/verify-otp", { data: { phone, code: "1234" } });
  expect(r2.ok()).toBeTruthy();
  return (await r2.json()).token as string;
}

export const auth = (token: string, lang = "en") => ({ authorization: `Bearer ${token}`, "accept-language": lang });

function isoDate(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000 + 4 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

/** First open pickup slot 2 days out and a delivery slot that respects the tier. */
export async function pickSlots(request: APIRequestContext, tierId: string, hours: number) {
  const pickups = await (await request.get(`/api/timeslots?date=${isoDate(2)}&tier=${tierId}&type=pickup`)).json();
  const pickup = pickups.find((s: { isFull: boolean }) => !s.isFull);
  const notBefore = new Date(new Date(pickup.start).getTime() + hours * 3_600_000);
  for (let day = 3; day < 8; day++) {
    const deliveries = await (
      await request.get(`/api/timeslots?date=${isoDate(day)}&tier=${tierId}&type=delivery&notBefore=${notBefore.toISOString()}`)
    ).json();
    const delivery = deliveries.find((s: { isFull: boolean }) => !s.isFull);
    if (delivery) return { pickupSlotId: pickup.id as string, deliverySlotId: delivery.id as string };
  }
  throw new Error("No delivery slot found");
}
