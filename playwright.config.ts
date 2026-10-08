import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end: drives the portal in a browser and the mobile API over HTTP,
 * against a dev server with the seeded database (`pnpm db:seed`).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const port = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "en-US",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
