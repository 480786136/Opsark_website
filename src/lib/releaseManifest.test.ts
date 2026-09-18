import { describe, expect, it, vi } from "vitest";
import { detectPlatform, loadReleaseManifest, normalizeManifest } from "./releaseManifest";

describe("release manifest", () => {
  it("enables configured downloads without requiring a checksum", () => {
    const manifest = normalizeManifest({
      channel: "stable",
      platforms: {
        macos: { available: true, url: "https://downloads.example/OpsArk.dmg", package: "DMG", sha256: "a".repeat(64) },
        windows: { available: true, url: "http://downloads.example/OpsArk.exe", package: "EXE" },
      },
    });
    expect(manifest.channel).toBe("stable");
    expect(manifest.platforms.macos.available).toBe(true);
    expect(manifest.platforms.macos.sha256).toHaveLength(64);
    expect(manifest.platforms.windows.available).toBe(true);
    expect(manifest.platforms.windows.sha256).toBeUndefined();
  });

  it("accepts same-origin server paths and rejects executable URLs", () => {
    const manifest = normalizeManifest({
      platforms: {
        macos: { available: true, url: "javascript:alert(1)", package: "DMG", sha256: "a".repeat(64) },
        windows: { available: true, url: "/releases/OpsArk.exe", package: "NSIS", sha256: "b".repeat(64) },
      },
    });
    expect(manifest.platforms.macos.available).toBe(false);
    expect(manifest.platforms.windows.available).toBe(true);
  });

  it.each(["", "javascript:alert(1)", "data:text/html,test", "//untrusted.example/file.exe", "/\\untrusted.example/file.exe", "https://user:secret@example.com/file.exe"])("keeps invalid download URL %s unavailable", (url) => {
    const manifest = normalizeManifest({ platforms: { windows: { available: true, url } } });
    expect(manifest.platforms.windows.available).toBe(false);
  });

  it("honors an explicitly unavailable release", () => {
    const manifest = normalizeManifest({ platforms: { macos: { available: false, url: "https://downloads.example/file.dmg" } } });
    expect(manifest.platforms.macos.available).toBe(false);
  });

  it("loads and normalizes remote JSON", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ platforms: {} }), { status: 200 }));
    const manifest = await loadReleaseManifest("/releases/manifest.json", request as typeof fetch);
    expect(request).toHaveBeenCalledOnce();
    expect(manifest.platforms.macos.package).toBe("DMG");
  });

  it("detects Windows and otherwise prefers macOS", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macos");
  });
});
