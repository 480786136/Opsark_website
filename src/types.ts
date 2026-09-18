export type PlatformId = "macos" | "windows";

export interface PlatformRelease {
  available: boolean;
  url: string;
  package: string;
  fileName?: string;
  sha256?: string;
  note?: string;
}

export interface ReleaseManifest {
  channel: "preview" | "stable";
  updatedAt: string | null;
  platforms: Record<PlatformId, PlatformRelease>;
}

export interface CommercialInquiry {
  name: string;
  email: string;
  company: string;
  role: string;
  platform: PlatformId | "both";
  useCase: string;
  consent: boolean;
  website: string;
}
