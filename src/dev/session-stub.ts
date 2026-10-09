import { vi } from "vitest";
import type { SessionUser } from "@/core/auth";

// 取代 @/core/auth：vi.mock("@/core/auth", () => import("@/dev/session-stub"))。預設是已登入的站長 alice，mockReset() 也會回到這個狀態；測沒登入或一般成員時各測試自己改

export const TEST_SESSION: SessionUser = { id: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", username: "alice", role: "owner" };

/** 另一個使用者（成員 bob）：測擁有權（IDOR）時用 requireSession.mockResolvedValue(OTHER_SESSION) 換成他 */
export const OTHER_SESSION: SessionUser = { id: "0b7e4d2a-9c1f-4e3b-8a5d-2f6c7b8e9a01", username: "bob", role: "member" };

export const requireSession = vi.fn(async (): Promise<SessionUser> => TEST_SESSION);

export const requireOwner = vi.fn(async (): Promise<SessionUser> => TEST_SESSION);

export const currentSession = vi.fn(async (): Promise<SessionUser | null> => TEST_SESSION);
