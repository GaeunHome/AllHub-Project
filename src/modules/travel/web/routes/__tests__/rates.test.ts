import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, canUseModule, currentSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../../service/cached", () => ({ cachedRates: vi.fn() }));

const cached = mocksOf(await import("../../../service/cached"), "cachedRates");
const { GET } = await import("../rates");

const TABLE = { date: "2026-11-12", rates: { USD: "32.986584" } };
const request = (date: string) => new Request(`https://hub.test/api/travel/rates?date=${date}`);

beforeEach(() => {
  // 台北時間 2026-11-13 早上
  vi.useFakeTimers({ now: new Date("2026-11-13T01:00:00Z"), toFake: ["Date"] });
  currentSession.mockReset().mockResolvedValue(TEST_SESSION);
  canUseModule.mockReset().mockResolvedValue(true);
  cached.cachedRates.mockReset().mockResolvedValue(TABLE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/travel/rates（使用者要的：記外幣時自動帶入那筆日期的匯率）", () => {
  it("沒登入_401；沒有旅遊的權限_403；都不讀匯率", async () => {
    currentSession.mockResolvedValueOnce(null);
    expect((await GET(request("2026-11-12"))).status).toBe(401);

    canUseModule.mockResolvedValueOnce(false);
    expect((await GET(request("2026-11-12"))).status).toBe(403);

    expect(cached.cachedRates).not.toHaveBeenCalled();
  });

  it("日期不對_400 不讀匯率（日期會成為快取的 key）", async () => {
    for (const date of ["", "2026-02-30", "latest", "2026-11-12%27"]) expect((await GET(request(date))).status).toBe(400);
    expect(cached.cachedRates).not.toHaveBeenCalled();
  });

  it("以前的日期讀那一天；今天與之後（照台北的日期）讀最新的", async () => {
    await GET(request("2026-11-12"));
    await GET(request("2026-11-13"));
    await GET(request("2026-12-24"));

    expect(cached.cachedRates.mock.calls).toEqual([["2026-11-12"], ["latest"], ["latest"]]);
  });

  it("回傳匯率與實際的日期；不讓瀏覽器或 CDN 存", async () => {
    const response = await GET(request("2026-11-12"));

    expect(await response.json()).toEqual(TABLE);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("讀不到_503 讓畫面寫暫時無法讀取", async () => {
    cached.cachedRates.mockResolvedValue(null);

    expect((await GET(request("2026-11-12"))).status).toBe(503);
  });
});
