import { vi } from "vitest";
import type { AuditActor } from "@/core/audit";

// 單元測試沒有請求可以讀 header 回傳固定的人 看得到呼叫過 audit 就好
export const ANONYMOUS_ACTOR = "（未登入）";
export const UNKNOWN_ACCOUNT = "不存在的帳號";
export const STUB_ACTOR: AuditActor = { id: null, name: "測試", ip: "127.0.0.1" };
export const auditActor = vi.fn(async () => STUB_ACTOR);
export const audit = vi.fn();
export const auditLoginFailure = vi.fn();
export const auditMergedFailure = vi.fn();
export const cleanupAudit = vi.fn(async () => "刪除 0 筆超過 7 天的操作紀錄");
