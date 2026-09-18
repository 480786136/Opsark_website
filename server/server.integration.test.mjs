import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWebsiteServer, loadProjectEnv } from "./server.mjs";

const quietLogger = { log() {}, warn() {}, error() {} };

async function createFixture(t, manifest = {}) {
  const projectRoot = await mkdtemp(join(tmpdir(), "opsark-website-server-"));
  await mkdir(join(projectRoot, "public", "releases"), { recursive: true });
  await mkdir(join(projectRoot, "dist"), { recursive: true });
  await writeFile(join(projectRoot, "dist", "index.html"), "<!doctype html><title>fixture</title>", "utf8");
  await writeManifest(projectRoot, {
    channel: "preview",
    updatedAt: null,
    platforms: {
      macos: { available: false, url: "", package: "DMG", note: "" },
      windows: { available: false, url: "", package: "NSIS", note: "" },
    },
    ...manifest,
  });
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  return projectRoot;
}

async function writeManifest(projectRoot, manifest) {
  await writeFile(
    join(projectRoot, "public", "releases", "manifest.json"),
    JSON.stringify(manifest),
    "utf8",
  );
}

async function start(projectRoot, options = {}) {
  const app = await createWebsiteServer({
    projectRoot,
    env: options.env || {},
    fetchImpl: options.fetchImpl,
    logger: quietLogger,
    rateLimitMax: options.rateLimitMax,
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  assert.equal(typeof address, "object");
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

function inquiry(index = 0, overrides = {}) {
  return {
    name: `测试用户${index}`,
    email: `person-${index}@example.com`,
    company: `测试团队${index}`,
    role: "sre",
    platform: "both",
    useCase: `在测试环境验证第 ${index} 个巡检与变更场景。`,
    consent: true,
    website: "",
    ...overrides,
  };
}

async function submit(baseUrl, body) {
  return fetch(`${baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readLeads(projectRoot) {
  const source = await readFile(join(projectRoot, "runtime", "leads.jsonl"), "utf8");
  return source.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("loads project .env without overriding inherited process variables", async (t) => {
  const projectRoot = await createFixture(t);
  const suffix = randomUUID().replaceAll("-", "_");
  const inheritedKey = `OPSARK_TEST_INHERITED_${suffix}`;
  const fileKey = `OPSARK_TEST_FILE_${suffix}`;
  process.env[inheritedKey] = "from-process";
  delete process.env[fileKey];
  await writeFile(join(projectRoot, ".env"), `${inheritedKey}=from-file\n${fileKey}=loaded\n`, "utf8");

  try {
    assert.equal(loadProjectEnv(projectRoot), true);
    assert.equal(process.env[inheritedKey], "from-process");
    assert.equal(process.env[fileKey], "loaded");
  } finally {
    delete process.env[inheritedKey];
    delete process.env[fileKey];
  }
});

test("release API applies startup env overrides and hot-reads the manifest", async (t) => {
  const projectRoot = await createFixture(t, {
    platforms: {
      macos: { available: false, url: "", package: "", note: "initial" },
      windows: {
        available: false,
        url: "/downloads/old.exe",
        package: "",
        fileName: "old.exe",
        sha256: "a".repeat(64),
        note: "old",
      },
    },
  });
  const env = { WINDOWS_DOWNLOAD_URL: " https://downloads.example/new.exe " };
  const { app, baseUrl } = await start(projectRoot, { env });

  try {
    const first = await fetch(`${baseUrl}/api/releases`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "no-store");
    const initial = await first.json();
    assert.deepEqual(initial.platforms.windows, {
      available: true,
      url: "https://downloads.example/new.exe",
      package: "NSIS",
      note: "old",
    });
    assert.equal(initial.platforms.macos.package, "DMG");

    await writeManifest(projectRoot, {
      channel: "stable",
      updatedAt: "2026-09-15T12:00:00.000Z",
      platforms: {
        macos: { available: true, url: "/downloads/live.dmg", note: "edited live" },
        windows: { available: false, url: "/downloads/manifest.exe", package: "EXE", note: "edited live" },
      },
    });
    env.WINDOWS_DOWNLOAD_URL = "https://downloads.example/without-restart.exe";

    const second = await fetch(`${baseUrl}/api/releases`);
    const edited = await second.json();
    assert.equal(edited.channel, "stable");
    assert.equal(edited.platforms.macos.url, "/downloads/live.dmg");
    assert.equal(edited.platforms.macos.available, true);
    assert.equal(edited.platforms.windows.url, "https://downloads.example/new.exe");
    assert.equal(edited.platforms.windows.note, "edited live");

    const head = await fetch(`${baseUrl}/api/releases`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("cache-control"), "no-store");
    assert.equal(await head.text(), "");
  } finally {
    await app.close();
  }

  env.MACOS_DOWNLOAD_URL = "https://downloads.example/restarted.dmg";
  const restarted = await start(projectRoot, { env });
  try {
    const response = await fetch(`${restarted.baseUrl}/api/releases`);
    const manifest = await response.json();
    assert.equal(manifest.platforms.windows.url, "https://downloads.example/without-restart.exe");
    assert.equal(manifest.platforms.macos.available, true);
    assert.equal(manifest.platforms.macos.url, "https://downloads.example/restarted.dmg");
    assert.equal(manifest.platforms.macos.package, "DMG");
  } finally {
    await restarted.app.close();
  }
});

test("release API returns a clear 503 for a damaged runtime manifest", async (t) => {
  const projectRoot = await createFixture(t);
  const { app, baseUrl } = await start(projectRoot);
  try {
    await writeFile(join(projectRoot, "public", "releases", "manifest.json"), "{ damaged", "utf8");
    const response = await fetch(`${baseUrl}/api/releases`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.code, "RELEASE_CONFIG_UNAVAILABLE");
    assert.match(body.message, /下载配置/);
  } finally {
    await app.close();
  }
});

test("durably stores real inquiry fields, survives restart, and never exposes the JSONL", async (t) => {
  const projectRoot = await createFixture(t);
  const failedWebhook = async () => { throw new Error("offline webhook"); };
  let running = await start(projectRoot, {
    env: { CONTACT_WEBHOOK_URL: "https://hooks.example/contact" },
    fetchImpl: failedWebhook,
  });

  const firstInquiry = inquiry(1, {
    name: "林川",
    email: "Lin@Example.com",
    company: "山岚科技",
    platform: "windows",
    useCase: "在二十台测试服务器上验证日常巡检和标准化变更。",
  });
  try {
    const response = await submit(running.baseUrl, firstInquiry);
    assert.equal(response.status, 201);
    const [stored] = await readLeads(projectRoot);
    assert.equal(stored.name, "林川");
    assert.equal(stored.email, "lin@example.com");
    assert.equal(stored.company, "山岚科技");
    assert.equal(stored.platform, "windows");
    assert.equal(stored.useCase, firstInquiry.useCase);
    assert.equal(stored.consent, true);
    assert.equal("website" in stored, false);

    const hidden = await fetch(`${running.baseUrl}/runtime/leads.jsonl`);
    assert.equal(hidden.status, 404);
    assert.doesNotMatch(await hidden.text(), /lin@example\.com/);
  } finally {
    await running.app.close();
  }

  running = await start(projectRoot);
  try {
    const response = await submit(running.baseUrl, inquiry(2));
    assert.equal(response.status, 201);
    const stored = await readLeads(projectRoot);
    assert.equal(stored.length, 2);
    assert.equal(stored[0].email, "lin@example.com");
    assert.equal(stored[1].email, "person-2@example.com");
  } finally {
    await running.app.close();
  }
});

test("serializes many concurrent inquiries into complete JSONL records", async (t) => {
  const projectRoot = await createFixture(t);
  const { app, baseUrl } = await start(projectRoot, { rateLimitMax: 100 });
  try {
    const count = 24;
    const responses = await Promise.all(Array.from({ length: count }, (_, index) => submit(baseUrl, inquiry(index))));
    assert.deepEqual(responses.map((response) => response.status), Array(count).fill(201));
    const stored = await readLeads(projectRoot);
    assert.equal(stored.length, count);
    assert.equal(new Set(stored.map((lead) => lead.id)).size, count);
    assert.equal(new Set(stored.map((lead) => lead.email)).size, count);
  } finally {
    await app.close();
  }
});

test("does not return success when durable storage fails", async (t) => {
  const projectRoot = await createFixture(t);
  const blockedPath = join(projectRoot, "blocked-storage");
  await mkdir(blockedPath);
  const { app, baseUrl } = await start(projectRoot, {
    env: { CONTACT_STORAGE_PATH: blockedPath },
  });
  try {
    const response = await submit(baseUrl, inquiry(9));
    assert.equal(response.status, 500);
    assert.match((await response.json()).message, /提交未完成/);
  } finally {
    await app.close();
  }
});

test("rejects a contact storage path inside the public dist tree", async (t) => {
  const projectRoot = await createFixture(t);
  await assert.rejects(
    createWebsiteServer({
      projectRoot,
      env: { CONTACT_STORAGE_PATH: "dist/leads.jsonl" },
      logger: quietLogger,
    }),
    /dist|公开|存储/i,
  );
});

test("rate limiting does not share one five-request quota across different emails", async (t) => {
  const projectRoot = await createFixture(t);
  const { app, baseUrl } = await start(projectRoot);
  try {
    const responses = [];
    for (let index = 0; index < 7; index += 1) {
      responses.push(await submit(baseUrl, inquiry(100 + index)));
    }
    assert.deepEqual(responses.map((response) => response.status), Array(7).fill(201));
  } finally {
    await app.close();
  }
});
