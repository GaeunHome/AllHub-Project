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
vi.mock("../../../service/cached", () => ({ cachedRoutes: vi.fn(), cachedStations: vi.fn(), cachedMetroLines: vi.fn(), cachedDirections: vi.fn(), cachedDepartures: vi.fn(), cachedLive: vi.fn(), cachedBusRoute: vi.fn(), cachedBusEta: vi.fn(), cachedBusSchedule: vi.fn() }));
vi.mock("next/server", () => ({ after: (work: () => void) => work() }));
vi.mock("../../../service/health", () => ({ reportTdx: vi.fn() }));
vi.mock("../../actions", () => ({ addRouteAction: vi.fn(), deleteRouteAction: vi.fn(), setTrackedAction: vi.fn() }));
vi.mock("../../components/search-form", { spy: true });

const cached = mocksOf(await import("../../../service/cached"), "cachedRoutes", "cachedStations", "cachedMetroLines", "cachedDirections", "cachedDepartures", "cachedLive", "cachedBusRoute", "cachedBusEta", "cachedBusSchedule");
const { TransitBody } = await import("../transit-page");
const { reportTdx } = await import("../../../service/health");
const { SearchForm } = await import("../../components/search-form");

const formProps = () => vi.mocked(SearchForm).mock.lastCall![0];
const groupNames = () => formProps().groups.map((group) => group.name);

const STATIONS = [{ id: "1000", name: "台北" }, { id: "1070", name: "左營" }];
const route = (overrides = {}) => ({ id: 1, userId: TEST_SESSION.id, mode: "thsr" as const, system: "", line: "", originId: "1000", originName: "台北", destinationId: "1070", destinationName: "左營", tracked: false, createdAt: new Date(), ...overrides });
const later = (minutes: number) => ({ at: Date.now() + minutes * 60_000, arrivesAt: Date.now() + (minutes + 94) * 60_000, trainNo: String(600 + minutes), kind: null, toward: "左營" });
const html = async (params: Record<string, string> = {}) => renderToStaticMarkup((await TransitBody({ searchParams: Promise.resolve(params) })) as ReactElement);
const render = async (params: Record<string, string> = {}) => textOf(await html(params));

beforeEach(() => {
  requireModule.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedRoutes.mockReset().mockResolvedValue([]);
  cached.cachedStations.mockReset().mockResolvedValue({ ok: true, data: STATIONS });
  cached.cachedMetroLines.mockReset().mockResolvedValue({ ok: true, data: [] });
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
    expect(text).toContain("加到常用");
  });

  it("常用路線滿了_不放加入的按鈕", async () => {
    cached.cachedRoutes.mockResolvedValue(Array.from({ length: 12 }, (_, id) => route({ id })));

    expect(await render({ mode: "thsr", from: "1000", to: "1070" })).not.toContain("加到常用");
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

  it("使用者遇過 畫面與系統狀態頁都看不到原因：車站清單讀不到時要記到系統狀態頁", async () => {
    cached.cachedStations.mockResolvedValue({ ok: false, problem: "TDX 回 401" });

    expect(await render()).toContain("車站資料暫時讀不到");
    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 401");
  });

  it("讀到了要清掉之前的錯誤 不然修好了系統狀態頁還是紅的", async () => {
    await render();

    expect(reportTdx).toHaveBeenLastCalledWith(null);
  });

  it("使用者要的：台鐵的起訖站用搜尋視窗 高鐵照舊是下拉", async () => {
    cached.cachedStations.mockResolvedValue({ ok: true, data: [{ id: "1000", name: "臺北", city: "臺北市" }] });

    const tra = await html({ mode: "tra", from: "1000" });
    expect(tra).toContain('aria-label="起站：臺北"');
    expect(tra).toContain('aria-label="迄站：請選擇"');
    expect(tra).not.toContain("<select");

    const thsr = await html({ mode: "thsr" });
    expect(thsr).toContain('<select name="from"');
    expect(thsr).not.toContain('aria-haspopup="dialog"');
  });

  it("使用者要的：捷運的起站用搜尋視窗 方向維持下拉", async () => {
    cached.cachedDirections.mockResolvedValue({ ok: true, data: [{ id: "R28", name: "淡水" }] });

    const markup = await html({ mode: "metro", system: "TRTC", from: "1000" });

    expect(markup).toContain('aria-label="起站：台北"');
    expect(markup).toContain('<select name="to"');
    expect(markup).toContain("往淡水");
  });

  it("只有捷運才讀路線 台鐵的縣市在車站清單裡 不多用額度", async () => {
    await render({ mode: "tra" });
    await render({ mode: "thsr" });
    await render({ mode: "bus" });
    expect(cached.cachedMetroLines).not.toHaveBeenCalled();

    await render({ mode: "metro", system: "TYMC" });
    expect(cached.cachedMetroLines).toHaveBeenCalledWith("TYMC");
  });

  it("路線讀不到_頁面照常 問題記到系統狀態頁", async () => {
    cached.cachedMetroLines.mockResolvedValue({ ok: false, problem: "TDX 回 404" });

    expect(await html({ mode: "metro", system: "TRTC" })).toContain('aria-label="起站：請選擇"');
    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 404");
  });

  it("台鐵照車站清單的縣市分組", async () => {
    cached.cachedStations.mockResolvedValue({ ok: true, data: [{ id: "1020", name: "板橋", city: "新北市" }, { id: "0900", name: "基隆", city: "基隆市" }] });

    await render({ mode: "tra" });

    expect(groupNames()).toEqual(["基隆市", "新北市"]);
  });

  it("捷運照路線分組 路線讀不到時退回完整清單 不能讓人選不了站", async () => {
    cached.cachedStations.mockResolvedValue({ ok: true, data: [{ id: "R10", name: "台北車站" }] });
    cached.cachedMetroLines.mockResolvedValue({ ok: true, data: [{ id: "R", stationIds: ["R10"] }] });
    await render({ mode: "metro", system: "TRTC" });
    expect(groupNames()).toEqual(["淡水信義線"]);

    cached.cachedMetroLines.mockResolvedValue({ ok: false, problem: "TDX 回 500" });
    await render({ mode: "metro", system: "TRTC" });
    expect(formProps().groups).toEqual([]);
    expect(formProps().stations).toEqual([{ id: "R10", name: "台北車站" }]);
  });

  it("使用者要的：常用車站來自自己存的路線 車站清單讀不到時也看得到 不多問 TDX", async () => {
    cached.cachedStations.mockResolvedValue({ ok: false, problem: "TDX 回 500" });
    cached.cachedRoutes.mockResolvedValue([route({ mode: "tra", originId: "1000", originName: "臺北", destinationId: "4400", destinationName: "高雄" })]);

    expect(await html({ mode: "tra", from: "1000" })).toContain('aria-label="起站：臺北"');
    expect(formProps().frequent).toEqual([{ id: "1000", name: "臺北" }, { id: "4400", name: "高雄" }]);
  });
});

describe("高鐵與台鐵的查詢結果", () => {
  const search = { mode: "thsr", from: "1000", to: "1070" };

  it("每一班都有車次與加到常用（使用者要的：有車次才加入常用），不再有整段路的按鈕", async () => {
    const markup = await html(search);

    // 還沒有路線時空狀態的說明也提到按鈕 寫在引號裡
    expect(textOf(markup).match(/加到常用(?!」)/g)).toHaveLength(3);
    expect(markup).not.toContain("加到常用路線");
    for (const trainNo of ["610", "620", "630"]) expect(textOf(markup)).toContain(`${trainNo} 車次`);
  });

  it("寫出總共幾班與每班要坐多久", async () => {
    const text = await render(search);

    expect(text).toContain("共 3 班");
    expect(text).toContain("1 小時 34 分");
  });

  it("已經存過的那一班寫已在常用，其他班照樣能加", async () => {
    cached.cachedRoutes.mockResolvedValue([route({ line: "620" })]);

    const text = await render(search);

    expect(text.match(/已在常用/g)).toHaveLength(1);
    expect(text.match(/加到常用/g)).toHaveLength(2);
  });

  it("別段路存了同一個車次_不算已在常用", async () => {
    cached.cachedRoutes.mockResolvedValue([route({ line: "620", destinationId: "1040" })]);

    expect(await render(search)).not.toContain("已在常用");
  });

  it("有關閉按鈕，按了回到不查詢的網址", async () => {
    const markup = await html(search);

    const closeLink = /<a [^>]*關閉查詢結果[^>]*>/.exec(markup)?.[0];

    expect(closeLink).toMatch(/href="\/transit\?mode=thsr&amp;from=1000&amp;date=[\d-]+"/);
  });

  it("選了出發時間_只列那個時間之後的班次", async () => {
    const dayStart = Date.parse("2026-11-20T00:00:00+08:00");
    const clock = (hour: number) => ({ at: dayStart + hour * 3_600_000, arrivesAt: dayStart + (hour + 2) * 3_600_000, trainNo: String(hour), kind: null, toward: null });
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [clock(8), clock(12), clock(18)] });

    const text = await render({ ...search, date: "2026-11-20", time: "10:00" });

    expect(text).toContain("共 2 班");
    expect(text).not.toMatch(/(?<!\d)8 車次/);
  });

  it("捷運沒有車次_維持加整段路", async () => {
    cached.cachedDirections.mockResolvedValue({ ok: true, data: [{ id: "1070", name: "左營" }] });

    expect(await render({ mode: "metro", system: "TRTC", from: "1000", to: "1070" })).toContain("加到常用路線");
  });

  it("公車的結果也能關閉", async () => {
    expect(await html({ mode: "bus", system: "Taipei", line: "307" })).toContain('aria-label="關閉查詢結果"');
  });
});

describe("查詢卡上面的交通工具分頁", () => {
  const tabs = (markup: string) => [...markup.matchAll(/<button[^>]*trn-mode[^>]*>/g)].map(([tag]) => tag);

  it("四個分頁都有圖示與名稱，看得出選到哪一個（使用者選的：圖示分頁）", async () => {
    const markup = await html({ mode: "tra" });

    expect(tabs(markup)).toHaveLength(4);
    expect(tabs(markup).filter((tag) => tag.includes('aria-pressed="true"'))).toHaveLength(1);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>.*?台鐵/);
    expect(await render({ mode: "tra" })).not.toContain("交通工具：");
  });

  it("捷運只能選臺北捷運、環狀線與機場捷運", async () => {
    const text = await render({ mode: "metro" });

    for (const name of ["臺北捷運", "環狀線", "機場捷運"]) expect(text).toContain(name);
    for (const name of ["高雄捷運", "淡海輕軌", "安坑輕軌", "新北捷運", "桃園捷運"]) expect(text).not.toContain(name);
  });
});
