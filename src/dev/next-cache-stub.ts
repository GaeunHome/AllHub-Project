import { vi } from "vitest";

// 真的 next/cache 只能在 Next 的請求裡呼叫 測試時由 alias 換成這裡的 spy
// 每個測試前由 vitest-setup.ts 清空 要檢查失效的測試直接對它們斷言

export const cacheTag = vi.fn<(...tags: string[]) => void>();

export const cacheLife = vi.fn<(profile: unknown) => void>();

export const updateTag = vi.fn<(tag: string) => void>();

export const revalidateTag = vi.fn<(tag: string, profile: unknown) => void>();

export const refresh = vi.fn<() => void>();
