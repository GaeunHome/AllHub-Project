import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, canUseModule, currentSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: (work: () => unknown) => work() }));
vi.mock("../../service/cached", () => ({ cachedRoutes: vi.fn(), cachedLive: vi.fn() }));
vi.mock("../../service/health", () => ({ reportTdx: vi.fn() }));

const cached = mocksOf(await import("../../service/cached"), "cachedRoutes", "cachedLive");
const { reportTdx } = mocksOf(await import("../../service/health"), "reportTdx");
const { GET } = await import("./live");

const ROUTE = { id: 7, userId: TEST_SESSION.id, mode: "tra", system: "", originId: "1000", destinationId: "4400" };
const request = (route: string | number = 7) => new Request(`https://hub.test/api/transit/live?route=${route}`);

beforeEach(() => {
  currentSession.mockReset().mockResolvedValue(TEST_SESSION);
  canUseModule.mockReset().mockResolvedValue(true);
  cached.cachedRoutes.mockReset().mockResolvedValue([ROUTE]);
  cached.cachedLive.mockReset().mockResolvedValue({ ok: true, data: { kind: "delays", delays: { "123": 5 } } });
  reportTdx.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/transit/live", () => {
  it("沒登入_401 不讀資料", async () => {
    currentSession.mockResolvedValue(null);

    expect((await GET(request())).status).toBe(401);
    expect(cached.cachedLive).not.toHaveBeenCalled();
  });

  it("沒有交通的權限_403", async () => {
    canUseModule.mockResolvedValue(false);

    expect((await GET(request())).status).toBe(403);
  });

  it("別人的路線 id 或亂填_404 不會替別人用掉額度", async () => {
    currentSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedRoutes.mockResolvedValue([]);

    expect((await GET(request())).status).toBe(404);
    expect((await GET(request("abc"))).status).toBe(404);
    expect(cached.cachedLive).not.toHaveBeenCalled();
  });

  it("回即時資料 只用網址的 id 挑自己的路線 回應不快取", async () => {
    const response = await GET(request());

    expect(await response.json()).toEqual({ kind: "delays", delays: { "123": 5 } });
    expect(cached.cachedRoutes).toHaveBeenCalledWith(TEST_SESSION.id);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("系統狀態：成功回報正常 失敗回報原因 畫面照時刻表", async () => {
    await GET(request());
    expect(reportTdx).toHaveBeenLastCalledWith(null);

    cached.cachedLive.mockResolvedValue({ ok: false, problem: "TDX 回 429" });
    const response = await GET(request());

    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 429");
    expect(await response.json()).toEqual({ kind: "none" });
  });
});
