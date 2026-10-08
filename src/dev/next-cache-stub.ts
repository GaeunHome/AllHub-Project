import { vi } from "vitest";

// 測試環境用的 next/cache（vitest.config.mts 的 alias）：真的版本要在 Next 的請求環境裡才能呼叫；全部換成 spy，每個測試前由 vitest-setup.ts 清空，要檢查失效的測試直接對它們斷言

export const cacheTag = vi.fn<(...tags: string[]) => void>();

export const cacheLife = vi.fn<(profile: unknown) => void>();

export const updateTag = vi.fn<(tag: string) => void>();

export const revalidateTag = vi.fn<(tag: string, profile: unknown) => void>();

export const refresh = vi.fn<() => void>();
