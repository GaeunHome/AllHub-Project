import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireModule } from "@/dev/session-stub";
import { stubCoreEnv, stubTransitEnv } from "@/dev/test-env";
import { mocksOf, textOf } from "@/dev/test-helpers";

stubCoreEnv();
stubTransitEnv();

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("../../service/cached", () => ({ cachedRoutes: vi.fn(), cachedStations: vi.fn(), cachedDirections: vi.fn(), cachedDepartures: vi.fn(), cachedLive: vi.fn(), cachedBusRoute: vi.fn(), cachedBusEta: vi.fn(), cachedBusSchedule: vi.fn() }));
vi.mock("../actions", () => ({ addRouteAction: vi.fn(), deleteRouteAction: vi.fn(), setTrackedAction: vi.fn() }));

const cached = mocksOf(await import("../../service/cached"), "cachedRoutes", "cachedStations", "cachedDirections", "cachedDepartures", "cachedLive", "cachedBusRoute", "cachedBusEta", "cachedBusSchedule");
const { TransitBody } = await import("./transit-page");

const STATIONS = [{ id: "1000", name: "台北" }, { id: "1070", name: "左營" }];
const route = (overrides = {}) => ({ id: 1, userId: TEST_SESSION.id, mode: "thsr" as const, system: "", line: "", originId: "1000", originName: "台北", destinationId: "1070", destinationName: "左營", tracked: false, createdAt: new Date(), ...overrides });
const later = (minutes: number) => ({ at: Date.now() + minutes * 60_000, arrivesAt: Date.now() + (minutes + 94) * 60_000, trainNo: String(600 + minutes), kind: null, toward: "左營" });
const render = async (params: Record<string, string> = {}) => textOf(renderToStaticMarkup((await TransitBody({ searchParams: Promise.resolve(params) })) as ReactElement));

beforeEach(() => {
  requireModule.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedRoutes.mockReset().mockResolvedValue([]);
  cached.cachedStations.mockReset().mockResolvedValue({ ok: true, data: STATIONS });
  cached.cachedDirections.mockReset().mockResolvedValue({ ok: true, data: [] });
  cached.cachedDepartures.mockReset().mockResolvedValue({ ok: true, data: [later(10), later(20), later(30)] });
  cached.cachedLive.mockReset().mockResolvedValue({ ok: true, data: { kind: "none" } });
  cached.cachedBusRoute.mockReset().mockResolvedValue({ ok: true, data: [{ direction: 0, name: "臺北車站", stops: [{ id: "TPE1", name: "板橋" }, { id: "TPE2", name: "西門" }] }, { direction: 1, name: "板橋", stops: [{ id: "TPE3", name: "西門" }] }] });
  cached.cachedBusEta.mockReset().mockResolvedValue({ ok: true, data: { TPE1: { seconds: 200, status: null }, TPE2: { seconds: null, status: "末班車已過" } } });
  cached.cachedBusSchedule.mockReset().mockResolvedValue({ ok: true, data: { headway: { min: 8, max: 12 }, departures: [] } });
});

describe("交通頁", () => {
  it("沒有常用路線_說明怎麼新增", async () => {
    expect(await render()).toContain("還沒有常用路線");
  });

  it("還沒選起訖站_不向 TDX 查時刻表 免費額度有限", async () => {
    await render({ mode: "thsr", from: "1000" });

    expect(cached.cachedDepartures).not.toHaveBeenCalled();
  });

  it("選好起訖站_列出班次與加到常用路線", async () => {
    const text = await render({ mode: "thsr", from: "1000", to: "1070" });

    expect(text).toContain("台北 → 左營");
    expect(text).toContain("610 車次");
    expect(text).toContain("加到常用路線");
  });

  it("常用路線滿了_不放加入的按鈕", async () => {
    cached.cachedRoutes.mockResolvedValue(Array.from({ length: 12 }, (_, id) => route({ id })));

    expect(await render({ mode: "thsr", from: "1000", to: "1070" })).not.toContain("加到常用路線");
  });

  it("追蹤中的路線放在追蹤區 其他在常用路線", async () => {
    cached.cachedRoutes.mockResolvedValue([route({ id: 1, tracked: true }), route({ id: 2, originName: "板橋" })]);

    const text = await render();

    expect(text.indexOf("追蹤中")).toBeLessThan(text.indexOf("常用路線"));
    expect(text).toContain("板橋 → 左營");
  });

  it("今天班次夠多_不讀明天 班次快沒了才讀 省免費額度", async () => {
    cached.cachedRoutes.mockResolvedValue([route()]);
    await render();
    expect(cached.cachedDepartures).toHaveBeenCalledTimes(1);

    cached.cachedDepartures.mockClear().mockResolvedValue({ ok: true, data: [later(10)] });
    await render();
    expect(cached.cachedDepartures).toHaveBeenCalledTimes(2);
  });

  it("公車查路線_每一站寫到站時間或狀態 也寫班距", async () => {
    const text = await render({ mode: "bus", system: "Taipei", line: "307" });

    expect(text).toContain("臺北市 307");
    expect(text).toContain("現在約 8–12 分鐘一班");
    expect(text).toContain("3 分 20 秒");
    expect(text).toContain("末班車已過");
    expect(text).toContain("往板橋");
  });

  it("公車還沒填路線_不向 TDX 查", async () => {
    await render({ mode: "bus", system: "Taipei" });

    expect(cached.cachedBusRoute).not.toHaveBeenCalled();
  });

  it("路線查不到_說明確認名稱 不多花額度讀到站時間", async () => {
    cached.cachedBusRoute.mockResolvedValue({ ok: true, data: [] });

    expect(await render({ mode: "bus", system: "Taipei", line: "9999" })).toContain("找不到這條路線");
    expect(cached.cachedBusEta).not.toHaveBeenCalled();
  });

  it("時刻表讀不到_那條路線自己說明 其他照常", async () => {
    cached.cachedRoutes.mockResolvedValue([route()]);
    cached.cachedDepartures.mockResolvedValue({ ok: false, problem: "TDX 回 500" });

    const text = await render();

    expect(text).toContain("資料讀不到");
    expect(text).not.toContain("TDX 回 500");
  });
});
