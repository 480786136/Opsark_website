import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 6_000 },
  reporter: "list",
  use: {
    baseURL: externalBaseUrl || "http://127.0.0.1:5176",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: externalBaseUrl ? undefined : {
    command: process.env.PLAYWRIGHT_SERVER_COMMAND || "npm run dev",
    url: "http://127.0.0.1:5176",
    reuseExistingServer: true,
    timeout: 30_000,
    env: {
      ...process.env,
      CONTACT_STORAGE_PATH: `/private/tmp/opsark-website-e2e-${process.pid}.jsonl`,
    },
  },
});
