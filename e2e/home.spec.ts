import { expect, test } from "@playwright/test";
import { createServer } from "node:http";

test("renders the product story and interactive audience content", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/OpsArk Core/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("有计划，有证据");

  const product = page.locator(".hero-product-wrap");
  const productBox = await product.boundingBox();
  expect(productBox).not.toBeNull();
  await page.mouse.move(productBox!.x + productBox!.width * 0.8, productBox!.y + productBox!.height * 0.4);
  await expect.poll(() => product.evaluate((element) => element.style.getPropertyValue("--tilt-y"))).not.toBe("0deg");

  await page.getByRole("tab", { name: "运维 / SRE" }).focus();
  await page.getByRole("tab", { name: "运维 / SRE" }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "技术负责人" })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "技术负责人" })).toContainText("高风险操作");

  await page.locator("#workflow").scrollIntoViewIfNeeded();
  await page.locator(".workflow-track button", { hasText: "独立校验" }).focus();
  await page.locator(".workflow-track button", { hasText: "独立校验" }).press("Enter");
  await expect(page.locator(".workflow-current")).toContainText("只读检查验证目标状态");
});

for (const [platform, tabName, fileName] of [
  ["windows", "Windows", "OpsArk-Core-Setup.exe"],
  ["macos", "macOS", "OpsArk-Core.dmg"],
] as const) {
  test(`downloads the ${platform} server package without submitting an inquiry`, async ({ page }) => {
    const packageBody = Buffer.from("OpsArk website download test fixture, not an installation package.");
    const packageServer = createServer((_request, response) => {
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": packageBody.length,
      });
      response.end(packageBody);
    });
    await new Promise<void>((resolve, reject) => {
      packageServer.once("error", reject);
      packageServer.listen(0, "127.0.0.1", resolve);
    });
    const address = packageServer.address();
    if (!address || typeof address === "string") throw new Error("Download fixture server did not start");
    const downloadUrl = `http://127.0.0.1:${address.port}/${fileName}`;
    try {
      let contactRequests = 0;
      page.on("request", (request) => {
        if (request.url().endsWith("/api/contact")) contactRequests += 1;
      });
      await page.route("**/api/releases", (route) => route.fulfill({ json: {
        channel: "preview",
        platforms: { [platform]: { available: true, url: downloadUrl, fileName } },
      } }));
      await page.goto("/");
      await page.locator("#download").scrollIntoViewIfNeeded();
      await page.getByRole("tab", { name: tabName, exact: true }).click();
      const downloadLink = page.getByRole("link", { name: platform === "macos" ? "下载 Mac" : "下载 Windows", exact: true });
      await expect(downloadLink).toHaveAttribute("href", downloadUrl);
      const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
      expect(download.suggestedFilename()).toBe(fileName);
      expect(await download.failure()).toBeNull();
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(packageBody);
      expect(contactRequests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => packageServer.close((error) => error ? reject(error) : resolve()));
    }
  });
}

test("shows an honest unavailable state before installation packages are configured", async ({ page }) => {
  await page.route("**/api/releases", (route) => route.fulfill({ json: { platforms: {} } }));
  await page.goto("/#download");
  await page.getByRole("tab", { name: "macOS", exact: true }).focus();
  await page.getByRole("tab", { name: "macOS", exact: true }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Windows", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Windows 版即将提供" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "下载 Windows", exact: true })).toHaveCount(0);
});

test("validates and stores a commercial inquiry", async ({ page }) => {
  await page.goto("/#contact");
  await page.getByLabel("姓名").fill("林川");
  await page.getByLabel("工作邮箱").fill("lin@example.com");
  await page.getByLabel("公司或团队").fill("山岚科技");
  await page.getByLabel("你的角色").selectOption("sre");
  await page.getByLabel("希望验证的运维场景").fill("希望在测试服务器中验证日常巡检与标准化变更流程。");
  await page.getByText("我同意 OpsArk 团队就本次产品演示或商业合作与我联系。").click();
  await page.getByRole("button", { name: "提交意向" }).click();
  await expect(page.getByRole("heading", { name: "意向已提交" })).toBeVisible();
});

test("keeps the primary navigation usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "下载", exact: true }).click();
  await expect(page.locator("#download")).toBeInViewport();
});
