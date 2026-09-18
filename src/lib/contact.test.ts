import { describe, expect, it, vi } from "vitest";
import type { CommercialInquiry } from "../types";
import { submitInquiry, validateInquiry } from "./contact";

const validInquiry: CommercialInquiry = {
  name: "林川",
  email: "lin@example.com",
  company: "山岚科技",
  role: "sre",
  platform: "both",
  useCase: "希望在测试环境验证日常巡检与变更流程。",
  consent: true,
  website: "",
};

describe("commercial inquiry", () => {
  it("returns field-level validation errors", () => {
    const errors = validateInquiry({ ...validInquiry, email: "invalid", consent: false });
    expect(errors.email).toBeTruthy();
    expect(errors.consent).toBeTruthy();
  });

  it("submits valid JSON and returns the receipt", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ id: "lead-1", receivedAt: "2026-09-15T00:00:00.000Z" }), { status: 201 }));
    const result = await submitInquiry("/api/contact", validInquiry, request as typeof fetch);
    expect(result.id).toBe("lead-1");
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not show success without a server save receipt", async () => {
    const request = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(submitInquiry("/api/contact", validInquiry, request as typeof fetch)).rejects.toThrow("保存确认");
  });
});
