import { chromium } from "playwright";
import { resolve } from "node:path";

const outputRoot = resolve("public/media");
const server = {
  id: "demo-web-01",
  name: "预览环境 Web-01",
  host: "203.0.113.24",
  port: 22,
  username: "ops-demo",
  group: "Preview Lab",
  status: "offline",
  environment: ["Nginx", "Docker", "PostgreSQL"],
  info: {
    os: "Ubuntu 24.04 LTS",
    kernel: "6.8.0-demo",
    cpu: "Demo Compute Node",
    cores: 8,
    memoryGb: 16,
    diskGb: 240,
    uptime: "18 days",
  },
  createdAt: "2026-09-15T00:00:00.000Z",
};

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath(),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  locale: "zh-CN",
});
await context.addInitScript((demoServer) => {
  localStorage.clear();
  localStorage.setItem("opsark.servers", JSON.stringify([demoServer]));
  localStorage.setItem("opsark.preferences.v1", JSON.stringify({ theme: "carbon", locale: "zh-CN" }));
}, server);

const page = await context.newPage();
await page.goto("http://127.0.0.1:1420/", { waitUntil: "networkidle" });
await page.screenshot({ path: resolve(outputRoot, "core-dashboard.png") });

await page.locator(".server-card").first().click();
await page.getByRole("button", { name: "查看终端历史" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(outputRoot, "core-workspace.png") });

await browser.close();
