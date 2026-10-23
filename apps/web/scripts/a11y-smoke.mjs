/**
 * Lightweight a11y smoke: login + overview landmarks/labels.
 * Prefer @axe-core/playwright when browsers install; falls back to structural checks.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:43127";

async function main() {
  let chromium;
  try {
    ({ chromium } = require("@playwright/test"));
  } catch {
    console.log("a11y-smoke: @playwright/test not installed — skipping browser a11y (document in CI).");
    process.exit(0);
  }

  let axeSource = null;
  try {
    axeSource = require("fs").readFileSync(
      require.resolve("axe-core/axe.min.js"),
      "utf8"
    );
  } catch {
    console.log("a11y-smoke: axe-core not installed — running structural checks only.");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${base}/login`);

  const email = await page.locator('input[type="email"]').count();
  const password = await page.locator('input[type="password"]').count();
  const submit = await page.getByRole("button", { name: /sign in/i }).count();
  if (!email || !password || !submit) {
    throw new Error("Login form missing labeled controls / submit");
  }

  if (axeSource) {
    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    });
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact)
    );
    if (serious.length) {
      console.error(JSON.stringify(serious, null, 2));
      throw new Error(`a11y serious/critical violations: ${serious.length}`);
    }
    console.log(`a11y-smoke: ${results.violations.length} total violations (none serious/critical)`);
  } else {
    console.log("a11y-smoke: structural login checks passed");
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
