import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenCache, type OAuthToken } from "../token-cache";

const MARGIN_MS = 60_000;

/** 每次回一個新的 token 回應由測試決定什麼時候到 */
function fakeServer() {
  const waiting: ((token: OAuthToken) => void)[] = [];
  let issued = 0;
  const fetchToken = vi.fn(() => new Promise<OAuthToken>((resolve) => waiting.push(resolve)));
  const answer = (expiresIn = 3600) => waiting.shift()?.({ access_token: `token-${++issued}`, expires_in: expiresIn });
  return { fetchToken, answer };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-09T00:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTokenCache：外部服務的 OAuth token", () => {
  it("同時要 token 只送一個請求 大家拿到同一個", async () => {
    const server = fakeServer();
    const cache = createTokenCache(server.fetchToken, MARGIN_MS);

    const both = Promise.all([cache.get(), cache.get()]);
    server.answer();

    expect(await both).toEqual(["token-1", "token-1"]);
    expect(server.fetchToken).toHaveBeenCalledTimes(1);
  });

  it("到期前 1 分鐘內就重拿：3600 秒的 token 59 分鐘時還用舊的 59 分 1 秒就換", async () => {
    const server = fakeServer();
    const cache = createTokenCache(server.fetchToken, MARGIN_MS);
    const first = cache.get();
    server.answer(3600);
    await first;

    vi.advanceTimersByTime(59 * 60_000 - 1);
    expect(await cache.get()).toBe("token-1");

    vi.advanceTimersByTime(1_001);
    const second = cache.get();
    server.answer();
    expect(await second).toBe("token-2");
  });

  it("被提早作廢後下一次重拿", async () => {
    const server = fakeServer();
    const cache = createTokenCache(server.fetchToken, MARGIN_MS);
    const first = cache.get();
    server.answer();
    await first;

    cache.invalidate();
    const second = cache.get();
    server.answer();

    expect(await second).toBe("token-2");
  });

  it("reset 也清掉拿到一半的請求：之後要的人送新的請求 舊的晚回來也不會被記住", async () => {
    const server = fakeServer();
    const cache = createTokenCache(server.fetchToken, MARGIN_MS);
    const stale = cache.get();

    cache.reset();
    const fresh = cache.get();
    expect(server.fetchToken).toHaveBeenCalledTimes(2);

    server.answer();
    await stale;
    server.answer();
    expect(await fresh).toBe("token-2");
    expect(await cache.get()).toBe("token-2");
  });

  it("拿 token 失敗時丟出原本的錯誤 下一次再拿", async () => {
    const fetchToken = vi.fn<() => Promise<OAuthToken>>().mockRejectedValueOnce(new Error("400")).mockResolvedValue({ access_token: "ok", expires_in: 3600 });
    const cache = createTokenCache(fetchToken, MARGIN_MS);

    await expect(cache.get()).rejects.toThrow("400");
    expect(await cache.get()).toBe("ok");
  });
});
