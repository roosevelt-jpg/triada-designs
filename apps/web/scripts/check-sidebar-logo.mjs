import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:43127/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "info@triada-designs.com");
await page.fill('input[name="password"]', "triada-local");
await Promise.all([
  page.waitForURL("**/overview", { timeout: 25000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(2000);
const logos = await page.locator('img[alt="Triada Designs"]').evaluateAll(els =>
  els.map(e => ({ src: e.getAttribute("src"), w: e.naturalWidth, h: e.naturalHeight, cw: e.clientWidth, ch: e.clientHeight, display: getComputedStyle(e).display }))
);
console.log(JSON.stringify(logos, null, 2));
const aside = await page.locator("aside").first().boundingBox();
console.log("aside", aside);
await page.locator("aside").first().screenshot({ path: "/tmp/sidebar.png" });
await browser.close();
