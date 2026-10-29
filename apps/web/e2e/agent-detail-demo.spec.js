const { test, expect } = require("@playwright/test");
const path = require("path");

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:43127";
const EMAIL = process.env.E2E_EMAIL || "info@triada-designs.com";
const PASSWORD = process.env.E2E_PASSWORD || "triada-local";
const SHOTS = process.env.DEMO_SCREENSHOT_DIR || "/opt/cursor/artifacts/screenshots";

test.use({
  video: process.env.DEMO_VIDEO === "1" ? "on" : "off",
});

test("agents card detail modal demo", async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL(/\/overview/, { timeout: 30_000 });

  await page.goto(`${BASE}/agents`);
  await expect(page.getByRole("heading", { name: /agents/i })).toBeVisible({ timeout: 30_000 });

  await page.screenshot({ path: path.join(SHOTS, "agent_list_demo.png"), fullPage: true });

  await page.getByRole("button", { name: "Open AI Support details" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Features & capabilities")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "agent_detail_open.png"), fullPage: true });

  await dialog.getByRole("button", { name: "Close agent detail" }).click();
  await expect(dialog).toBeHidden();

  const smmCard = page.locator('[role="button"][aria-label*="Social Media Manager"]');
  await smmCard.getByRole("button", { name: "View details" }).click();
  await expect(page.getByRole("dialog").getByText("Features & capabilities")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "smm_detail_open.png"), fullPage: true });
});
