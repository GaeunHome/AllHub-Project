import { vi } from "vitest";
import type { SessionUser } from "@/core/auth";

// 取代 @/core/auth：vi.mock("@/core/auth", () => import("@/dev/session-stub"))。預設是已登入的 alice，mockReset() 也會回到這個狀態；測沒登入時各測試自己改

export const TEST_SESSION: SessionUser = { id: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", username: "alice" };

export const requireSession = vi.fn(async (): Promise<SessionUser> => TEST_SESSION);

export const currentSession = vi.fn(async (): Promise<SessionUser | null> => TEST_SESSION);
