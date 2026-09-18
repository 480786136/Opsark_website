import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_CONFIG_ERROR = "RELEASE_CONFIG_UNAVAILABLE";
const COMPRESSIBLE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg", ".txt"]);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Load the project's .env without replacing variables inherited by the process. */
export function loadProjectEnv(projectRoot = defaultProjectRoot) {
  const envPath = join(resolve(projectRoot), ".env");
  if (!existsSync(envPath)) return false;

  const inherited = new Map(Object.entries(process.env));
  process.loadEnvFile(envPath);
  for (const [key, value] of inherited) process.env[key] = value;
  return true;
}

function releaseConfigError(message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), {
    code: RELEASE_CONFIG_ERROR,
    status: 503,
  });
}

function optionalString(entry, field, platform) {
  const value = entry[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw releaseConfigError(`${platform}.${field} 必须是字符串。`);
  }
  return value;
}

function normalizeReleaseEntry(value, platform, downloadOverride) {
  if (value !== undefined && !isRecord(value)) {
    throw releaseConfigError(`${platform} 发布配置必须是对象。`);
  }
  const entry = value || {};
  if (entry.available !== undefined && typeof entry.available !== "boolean") {
    throw releaseConfigError(`${platform}.available 必须是布尔值。`);
  }

  const manifestUrl = optionalString(entry, "url", platform) || "";
  const manifestPackage = nonEmpty(optionalString(entry, "package", platform));
  const result = {
    available: downloadOverride ? true : entry.available === true,
    url: downloadOverride || manifestUrl,
    package: manifestPackage || (platform === "windows" ? "NSIS" : "DMG"),
  };

  if (!downloadOverride) {
    for (const field of ["fileName", "sha256"]) {
      const optionalValue = optionalString(entry, field, platform);
      if (optionalValue !== undefined) result[field] = optionalValue;
    }
  }
  const note = optionalString(entry, "note", platform);
  if (note !== undefined) result.note = note;
  return result;
}

async function readReleaseConfig(manifestPath, downloadOverrides) {
  let source;
  try {
    source = await readFile(manifestPath, "utf8");
  } catch (error) {
    throw releaseConfigError("无法读取发布清单。", error);
  }

  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    throw releaseConfigError("发布清单不是有效的 JSON。", error);
  }

  if (!isRecord(manifest) || !isRecord(manifest.platforms)) {
    throw releaseConfigError("发布清单必须包含 platforms 对象。");
  }
  if (manifest.channel !== undefined && !["preview", "stable"].includes(manifest.channel)) {
    throw releaseConfigError("发布清单 channel 必须是 preview 或 stable。");
  }
  if (manifest.updatedAt !== undefined && manifest.updatedAt !== null && typeof manifest.updatedAt !== "string") {
    throw releaseConfigError("发布清单 updatedAt 必须是字符串或 null。");
  }

  return {
    channel: manifest.channel || "preview",
    updatedAt: manifest.updatedAt ?? null,
    platforms: {
      macos: normalizeReleaseEntry(manifest.platforms.macos, "macos", downloadOverrides.macos),
      windows: normalizeReleaseEntry(manifest.platforms.windows, "windows", downloadOverrides.windows),
    },
  };
}

function createDurableLeadWriter(storagePath) {
  let tail = Promise.resolve();

  return function appendLead(lead) {
    const task = tail.then(async () => {
      await mkdir(dirname(storagePath), { recursive: true });
      const file = await open(storagePath, "a", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(lead)}\n`, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
    });
    tail = task.catch(() => undefined);
    return task;
  };
}

function isInside(root, target) {
  const child = relative(root, target);
  return child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`));
}

export async function createWebsiteServer(options = {}) {
  const projectRoot = resolve(options.projectRoot || defaultProjectRoot);
  const distRoot = join(projectRoot, "dist");
  const manifestPath = join(projectRoot, "public", "releases", "manifest.json");
  const environment = { ...(options.env === undefined ? process.env : options.env) };
  const devMode = options.devMode ?? false;
  const logger = options.logger || console;
  const fetchImpl = options.fetchImpl || fetch;
  const configuredStorage = options.storagePath || environment.CONTACT_STORAGE_PATH || "runtime/leads.jsonl";
  const storagePath = isAbsolute(configuredStorage) ? configuredStorage : resolve(projectRoot, configuredStorage);
  if (isInside(distRoot, storagePath)) {
    throw new Error("CONTACT_STORAGE_PATH must not be inside the public dist directory.");
  }
  const rateLimitMax = Number.isFinite(options.rateLimitMax) ? options.rateLimitMax : 5;
  const rateLimitWindowMs = Number.isFinite(options.rateLimitWindowMs) ? options.rateLimitWindowMs : 10 * 60 * 1_000;
  const trustProxyHops = Math.min(5, Math.max(0, Number.parseInt(environment.TRUST_PROXY_HOPS || "0", 10) || 0));
  const downloadOverrides = {
    macos: nonEmpty(environment.MACOS_DOWNLOAD_URL),
    windows: nonEmpty(environment.WINDOWS_DOWNLOAD_URL),
  };
  const webhookUrl = nonEmpty(environment.CONTACT_WEBHOOK_URL);
  const rateLimit = new Map();
  const appendLead = createDurableLeadWriter(storagePath);
  const cspConnectSources = ["'self'", ...String(environment.CSP_CONNECT_SRC || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" ? [url.origin] : [];
      } catch {
        return [];
      }
    })];

  let validatedWebhookUrl = "";
  if (webhookUrl) {
    try {
      const parsedWebhook = new URL(webhookUrl);
      if (parsedWebhook.protocol !== "https:") throw new Error("webhook must use HTTPS");
      validatedWebhookUrl = parsedWebhook.href;
    } catch {
      throw new Error("CONTACT_WEBHOOK_URL must be a valid HTTPS URL.");
    }
  }

  function securityHeaders(response) {
    const connectSrc = [...cspConnectSources, ...(devMode ? ["ws:"] : [])].join(" ");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader(
      "Content-Security-Policy",
      devMode
        ? `default-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src ${connectSrc}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
        : `default-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; connect-src ${connectSrc}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    );
  }

  function json(request, response, status, body) {
    const payload = Buffer.from(JSON.stringify(body));
    securityHeaders(response);
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": payload.length,
    });
    response.end(request.method === "HEAD" ? undefined : payload);
  }

  async function readJsonBody(request) {
    if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      throw Object.assign(new Error("请使用 JSON 提交。"), { status: 415 });
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 32_768) throw Object.assign(new Error("提交内容过长。"), { status: 413 });
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw Object.assign(new Error("提交内容格式不正确。"), { status: 400 });
    }
  }

  function text(value, maxLength) {
    return typeof value === "string"
      ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, maxLength)
      : "";
  }

  function normalizeInquiry(body) {
    const inquiry = {
      name: text(body?.name, 80),
      email: text(body?.email, 160).toLowerCase(),
      company: text(body?.company, 120),
      role: text(body?.role, 40),
      platform: text(body?.platform, 20),
      useCase: text(body?.useCase, 2_000),
      consent: body?.consent === true,
      website: text(body?.website, 200),
    };
    if (inquiry.name.length < 2) throw Object.assign(new Error("请填写姓名。"), { status: 422 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) throw Object.assign(new Error("请填写有效的工作邮箱。"), { status: 422 });
    if (inquiry.company.length < 2) throw Object.assign(new Error("请填写公司或团队名称。"), { status: 422 });
    if (!["sre", "developer", "lead", "business", "other"].includes(inquiry.role)) throw Object.assign(new Error("请选择你的角色。"), { status: 422 });
    if (!["macos", "windows", "both"].includes(inquiry.platform)) throw Object.assign(new Error("请选择目标平台。"), { status: 422 });
    if (inquiry.useCase.length < 10) throw Object.assign(new Error("请补充希望验证的场景。"), { status: 422 });
    if (!inquiry.consent) throw Object.assign(new Error("请确认联系授权。"), { status: 422 });
    return inquiry;
  }

  function requestAddress(request) {
    if (trustProxyHops > 0) {
      const forwarded = String(request.headers["x-forwarded-for"] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const candidate = forwarded[forwarded.length - trustProxyHops];
      if (candidate && isIP(candidate)) return candidate;
    }
    return request.socket.remoteAddress || "unknown";
  }

  function allowBucket(key, maximum) {
    const now = Date.now();
    const attempts = (rateLimit.get(key) || []).filter((timestamp) => now - timestamp < rateLimitWindowMs);
    if (attempts.length >= maximum) return false;
    attempts.push(now);
    rateLimit.set(key, attempts);
    return true;
  }

  function allowRequest(address, email) {
    const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 16);
    return allowBucket(`identity:${address}:${emailKey}`, rateLimitMax) && allowBucket(`source:${address}`, 60);
  }

  async function handleContact(request, response) {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      json(request, response, 405, { message: "只支持 POST 请求。" });
      return;
    }
    try {
      const body = await readJsonBody(request);
      if (text(body?.website, 200)) {
        json(request, response, 201, { id: "received", receivedAt: new Date().toISOString() });
        return;
      }
      const inquiry = normalizeInquiry(body);
      if (!allowRequest(requestAddress(request), inquiry.email)) {
        json(request, response, 429, { message: "提交过于频繁，请稍后再试。" });
        return;
      }
      const lead = {
        id: `lead_${randomUUID()}`,
        receivedAt: new Date().toISOString(),
        ...inquiry,
        website: undefined,
      };
      await appendLead(lead);

      if (validatedWebhookUrl) {
        try {
          const webhookResponse = await fetchImpl(validatedWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lead),
            redirect: "error",
            signal: AbortSignal.timeout(8_000),
          });
          if (!webhookResponse.ok) logger.warn(`Contact webhook returned ${webhookResponse.status}`);
          await webhookResponse.body?.cancel();
        } catch (error) {
          logger.warn("Contact webhook failed; the inquiry remains stored locally.", error instanceof Error ? error.message : error);
        }
      }

      json(request, response, 201, { id: lead.id, receivedAt: lead.receivedAt });
    } catch (error) {
      const status = Number(error?.status) || 500;
      json(request, response, status, { message: status === 500 ? "提交未完成，请稍后再试。" : error.message });
    }
  }

  async function handleReleases(request, response) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      json(request, response, 405, { message: "只支持 GET 和 HEAD 请求。" });
      return;
    }
    try {
      const manifest = await readReleaseConfig(manifestPath, downloadOverrides);
      json(request, response, 200, manifest);
    } catch (error) {
      logger.error("Release manifest unavailable.", error instanceof Error ? error.message : error);
      json(request, response, 503, {
        code: RELEASE_CONFIG_ERROR,
        message: "下载配置暂不可用，请检查服务器发布清单。",
      });
    }
  }

  async function serveStatic(request, response) {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      json(request, response, 400, { message: "请求路径格式不正确。" });
      return;
    }
    const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
    let filePath = resolve(distRoot, `.${safePath}`);
    if (!isInside(distRoot, filePath)) {
      json(request, response, 403, { message: "拒绝访问。" });
      return;
    }
    try {
      const fileStats = await stat(filePath);
      if (fileStats.isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      if (extname(pathname)) {
        json(request, response, 404, { message: "资源不存在。" });
        return;
      }
      filePath = join(distRoot, "index.html");
    }
    try {
      const body = await readFile(filePath);
      securityHeaders(response);
      const extension = extname(filePath).toLowerCase();
      const acceptsGzip = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(String(request.headers["accept-encoding"] || ""));
      const shouldCompress = acceptsGzip && body.length > 1_024 && COMPRESSIBLE_EXTENSIONS.has(extension);
      const responseBody = shouldCompress ? gzipSync(body, { level: 6 }) : body;
      const cacheControl = extension === ".html" || extension === ".json"
        ? "no-cache"
        : pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600";
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
        "Cache-Control": cacheControl,
        "Content-Length": responseBody.length,
        ...(COMPRESSIBLE_EXTENSIONS.has(extension) ? { Vary: "Accept-Encoding" } : {}),
        ...(shouldCompress ? { "Content-Encoding": "gzip" } : {}),
      });
      response.end(request.method === "HEAD" ? undefined : responseBody);
    } catch {
      json(request, response, 500, { message: "网站构建产物不存在，请先运行 npm run build。" });
    }
  }

  const vite = devMode
    ? await (await import("vite")).createServer({
        root: projectRoot,
        server: { middlewareMode: true, hmr: { server: undefined } },
        appType: "spa",
      })
    : null;

  async function routeRequest(request, response) {
    const route = (request.url || "").split("?")[0];
    if (route === "/api/contact") {
      await handleContact(request, response);
      return;
    }
    if (route === "/api/releases") {
      await handleReleases(request, response);
      return;
    }
    if (vite) {
      securityHeaders(response);
      vite.middlewares(request, response, (error) => {
        if (error) json(request, response, 500, { message: "开发服务器未能处理请求。" });
      });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      json(request, response, 405, { message: "不支持这个请求方法。" });
      return;
    }
    await serveStatic(request, response);
  }

  const server = createServer((request, response) => {
    routeRequest(request, response).catch((error) => {
      logger.error("Unhandled request error", error instanceof Error ? error.message : error);
      if (!response.headersSent) json(request, response, 500, { message: "服务器未能处理请求。" });
      else response.destroy();
    });
  });

  const rateCleanup = setInterval(() => {
    const cutoff = Date.now() - rateLimitWindowMs;
    for (const [key, attempts] of rateLimit) {
      const recent = attempts.filter((timestamp) => timestamp > cutoff);
      if (recent.length) rateLimit.set(key, recent);
      else rateLimit.delete(key);
    }
  }, rateLimitWindowMs);
  rateCleanup.unref();

  return {
    server,
    projectRoot,
    storagePath,
    async listen(listenOptions = {}) {
      const host = listenOptions.host || environment.HOST || "127.0.0.1";
      const port = listenOptions.port ?? Number(environment.PORT || 5176);
      await new Promise((resolvePromise, rejectPromise) => {
        const onError = (error) => rejectPromise(error);
        server.once("error", onError);
        server.listen(port, host, () => {
          server.off("error", onError);
          resolvePromise();
        });
      });
      return server.address();
    },
    async close() {
      clearInterval(rateCleanup);
      await vite?.close();
      if (!server.listening) return;
      await new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => error ? rejectPromise(error) : resolvePromise());
      });
    },
  };
}

async function runCli() {
  loadProjectEnv(defaultProjectRoot);
  const app = await createWebsiteServer({
    projectRoot: defaultProjectRoot,
    devMode: process.argv.includes("--dev"),
  });
  const address = await app.listen();
  const host = typeof address === "object" && address ? address.address : process.env.HOST || "127.0.0.1";
  const port = typeof address === "object" && address ? address.port : Number(process.env.PORT || 5176);
  console.log(`OpsArk website running at http://${host}:${port}`);
  console.log(`Commercial inquiries are stored at ${app.storagePath}`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((error) => {
    console.error("OpsArk website failed to start.", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
