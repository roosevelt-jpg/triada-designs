const { test, expect } = require("@playwright/test");

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:43127";
const EMAIL = process.env.E2E_EMAIL || "admin@triada-designs.com";
const PASSWORD = process.env.E2E_PASSWORD || "triada-local";

test.describe("Triada ops smoke", () => {
  test("login → overview → inbox → meta hub → automations dry-run", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole("heading", { name: /admin sign in/i })).toBeVisible();

    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL(/\/overview/);
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();

    await page.getByRole("link", { name: /unified inbox/i }).click();
    await page.waitForURL(/\/inbox/);
    await expect(page.getByRole("heading", { name: /inbox/i })).toBeVisible();

    await page.goto(`${BASE}/integrations/meta`);
    await expect(page.getByRole("heading", { name: /meta messaging/i })).toBeVisible();
    await expect(page.getByText(/local inbound simulator/i)).toBeVisible();

    await page.goto(`${BASE}/automations`);
    await expect(page.getByRole("heading", { name: /workflow/i })).toBeVisible();

    const firstWorkflow = page.locator('a[href*="/automations/"]').first();
    if (await firstWorkflow.count()) {
      await firstWorkflow.click();
      const dryRun = page.getByRole("button", { name: /dry-run|dry run/i });
      if (await dryRun.count()) {
        await dryRun.click();
      }
    }
  });
});
