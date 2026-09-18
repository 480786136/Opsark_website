import type { CommercialInquiry } from "../types";

export interface InquiryResult {
  id: string;
  receivedAt: string;
}

export function validateInquiry(inquiry: CommercialInquiry): Record<string, string> {
  const errors: Record<string, string> = {};
  if (inquiry.name.trim().length < 2) errors.name = "请填写姓名。";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email.trim())) errors.email = "请填写有效的工作邮箱。";
  if (inquiry.company.trim().length < 2) errors.company = "请填写公司或团队名称。";
  if (!inquiry.role) errors.role = "请选择你的角色。";
  if (inquiry.useCase.trim().length < 10) errors.useCase = "请至少用 10 个字描述希望验证的场景。";
  if (!inquiry.consent) errors.consent = "提交前请确认我们可以就本次需求与你联系。";
  return errors;
}

export async function submitInquiry(
  endpoint: string,
  inquiry: CommercialInquiry,
  request: typeof fetch = fetch,
): Promise<InquiryResult> {
  const response = await request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(inquiry),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.message === "string" ? body.message : "提交未完成，请稍后再试。");
  }
  if (typeof body.id !== "string" || !body.id || typeof body.receivedAt !== "string" || !body.receivedAt) {
    throw new Error("尚未收到保存确认，请稍后再试。");
  }
  return {
    id: body.id,
    receivedAt: body.receivedAt,
  };
}
