import { vi } from "vitest";
import type { SessionUser } from "@/core/auth";

// 用 vi.mock 把 @/core/auth 換成這個檔案 預設是已登入的站長 alice
// mockReset 後也回到這裡 測沒登入或一般成員時各測試自己改

export const TEST_SESSION: SessionUser = { id: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", username: "alice", nickname: null, role: "owner" };

/** 另一個使用者 成員 bob 測 IDOR 時讓 requireSession 改回傳他 */
export const OTHER_SESSION: SessionUser = { id: "0b7e4d2a-9c1f-4e3b-8a5d-2f6c7b8e9a01", username: "bob", nickname: null, role: "member" };

export const requireSession = vi.fn(async (): Promise<SessionUser> => TEST_SESSION);

export const requireOwner = vi.fn(async (): Promise<SessionUser> => TEST_SESSION);

export const currentSession = vi.fn(async (): Promise<SessionUser | null> => TEST_SESSION);

/** 跟著 requireSession 換登入者 預設每個模組都能用 測沒權限時各測試自己改 */
export const requireModule = vi.fn<(moduleId: string) => Promise<SessionUser>>(async () => requireSession());

export const deniedModules = vi.fn(async (): Promise<ReadonlySet<string>> => new Set<string>());

export const canUseModule = vi.fn(async (): Promise<boolean> => true);

export const usableModules = vi.fn(async <T extends { id: string }>(modules: readonly T[]): Promise<T[]> => [...modules]);
