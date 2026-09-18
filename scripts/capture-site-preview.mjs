import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const captureRoot = process.env.OPSARK_SITE_CAPTURE_DIR || "/private/tmp/opsark-site-previews";
await mkdir(captureRoot, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath(),
});

async function capture(name, viewport, theme, fullPage = true) {
  const context = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1 });
  await context.addInitScript((selectedTheme) => localStorage.setItem("opsark.website.theme", selectedTheme), theme);
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5176", { waitUntil: "networkidle" });
  await page.locator(".site.ready").waitFor();
  await page.waitForTimeout(500);
  if (fullPage) {
    for (const section of await page.locator("[data-reveal]").all()) {
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
    }
    await page.locator("#top").scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: resolve(captureRoot, `${name}.png`), fullPage });
  await context.close();
}

await capture("desktop-dark", { width: 1440, height: 900 }, "dark");
await capture("desktop-dark-fold", { width: 1440, height: 900 }, "dark", false);
await capture("desktop-light-fold", { width: 1440, height: 900 }, "light", false);
await capture("mobile-dark", { width: 390, height: 844 }, "dark");
await capture("mobile-dark-fold", { width: 390, height: 844 }, "dark", false);
await browser.close();
