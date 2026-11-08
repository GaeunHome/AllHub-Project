import { vi } from "vitest";

// notFound 與 unstable_rethrow 用真的
// mockReset 後回到這裡的預設

const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");

/** useRouter 每次都回傳這一個 測試直接對它斷言 */
export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };

export const useRouter = vi.fn(() => router);

export const usePathname = vi.fn((): string => "/");

/**
 * 跟真的一樣丟錯 後面的程式不會繼續跑
 * digest 照 Next 的格式 unstable_rethrow 才認得
 */
export const redirect = vi.fn((url: string, type: "push" | "replace" = "replace"): never => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${url}`), { digest: `NEXT_REDIRECT;${type};${url};307;` });
});

export const { notFound, unstable_rethrow } = actual;
