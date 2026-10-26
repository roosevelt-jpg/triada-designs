import { chromium } from "playwright";

const outDir = "/cursor/stores/bc-632e2274-51b0-4613-a623-6f3b3234617d/media";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto("http://127.0.0.1:43127/login", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${outDir}/triada-login-brand.png`, fullPage: false });

await page.fill('input[name="email"]', "info@triada-designs.com");
await page.fill('input[name="password"]', "triada-local");
await Promise.all([
  page.waitForURL("**/overview", { timeout: 25000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/triada-overview-after-login.png`, fullPage: false });

console.log("login_ok", page.url());
console.log("logo_visible", await page.locator('img[alt="Triada Designs"]').first().isVisible());
await browser.close();
