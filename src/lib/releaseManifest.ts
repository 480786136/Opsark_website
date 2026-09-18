import type { PlatformId, PlatformRelease, ReleaseManifest } from "../types";

const EMPTY_RELEASE: PlatformRelease = {
  available: false,
  url: "",
  package: "",
  note: "",
};

export const emptyManifest: ReleaseManifest = {
  channel: "preview",
  updatedAt: null,
  platforms: {
    macos: { ...EMPTY_RELEASE, package: "DMG" },
    windows: { ...EMPTY_RELEASE, package: "NSIS" },
  },
};

function safeDownloadUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate || /[\u0000-\u001f\u007f\\]/.test(candidate)) return "";
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  try {
    const parsed = new URL(candidate);
    return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : "";
  } catch {
    return "";
  }
}

function normalizePlatform(value: unknown, fallback: PlatformRelease): PlatformRelease {
  if (!value || typeof value !== "object") return { ...fallback };
  const input = value as Record<string, unknown>;
  const url = safeDownloadUrl(input.url);
  const sha256 = typeof input.sha256 === "string" && /^[a-f\d]{64}$/i.test(input.sha256)
    ? input.sha256.toLowerCase()
    : undefined;
  const available = input.available === true && Boolean(url);
  return {
    available,
    url: available ? url : "",
    package: typeof input.package === "string" && input.package.trim() ? input.package.trim() : fallback.package,
    fileName: typeof input.fileName === "string" ? input.fileName.trim() : undefined,
    sha256,
    note: typeof input.note === "string" && input.note.trim() ? input.note.trim() : fallback.note,
  };
}

export function normalizeManifest(value: unknown): ReleaseManifest {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const platforms = input.platforms && typeof input.platforms === "object"
    ? input.platforms as Record<string, unknown>
    : {};
  return {
    channel: input.channel === "stable" ? "stable" : "preview",
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    platforms: {
      macos: normalizePlatform(platforms.macos, emptyManifest.platforms.macos),
      windows: normalizePlatform(platforms.windows, emptyManifest.platforms.windows),
    },
  };
}

export async function loadReleaseManifest(url: string, request: typeof fetch = fetch): Promise<ReleaseManifest> {
  const response = await request(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`release manifest returned ${response.status}`);
  return normalizeManifest(await response.json());
}

export function detectPlatform(userAgent: string): PlatformId {
  return /windows/i.test(userAgent) ? "windows" : "macos";
}
