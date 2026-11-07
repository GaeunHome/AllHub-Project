import type { ReactElement } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAY_MS, taipeiDateKey } from "@/core/time";
import { TEST_SESSION, requireModule } from "@/dev/session-stub";
import { stubCoreEnv, stubTransitEnv } from "@/dev/test-env";
import { mocksOf, textOf } from "@/dev/test-helpers";

stubCoreEnv();
stubTransitEnv();

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("../../../service/cached", () => ({ cachedRoutes: vi.fn(), cachedStations: vi.fn(), cachedMetroNetwork: vi.fn(), cachedDepartures: vi.fn(), cachedMetroDepartures: vi.fn(), cachedLive: vi.fn(), cachedBusRoute: vi.fn(), cachedBusEta: vi.fn(), cachedBusSchedule: vi.fn(), cachedThsrFares: vi.fn(), cachedTraFares: vi.fn(), cachedMetroFare: vi.fn(), cachedMetroTravelTimes: vi.fn() }));
vi.mock("next/server", () => ({ after: (work: () => void) => work() }));
vi.mock("../../../service/health", () => ({ reportTdx: vi.fn() }));
vi.mock("../../actions", () => ({ addRouteAction: vi.fn(), deleteRouteAction: vi.fn(), setTrackedAction: vi.fn() }));
vi.mock("../../components/search-form", { spy: true });

const cached = mocksOf(await import("../../../service/cached"), "cachedRoutes", "cachedStations", "cachedMetroNetwork", "cachedDepartures", "cachedMetroDepartures", "cachedLive", "cachedBusRoute", "cachedBusEta", "cachedBusSchedule", "cachedThsrFares", "cachedTraFares", "cachedMetroFare", "cachedMetroTravelTimes");
const { TransitBody } = await import("../transit-page");
const { reportTdx } = await import("../../../service/health");
const { SearchForm } = await import("../../components/search-form");

const formProps = () => vi.mocked(SearchForm).mock.lastCall![0];
const groupNames = () => formProps().groups.map((group) => group.name);

const STATIONS = [{ id: "1000", name: "台北" }, { id: "1070", name: "左營" }];
const route = (overrides = {}) => ({ id: 1, userId: TEST_SESSION.id, mode: "thsr" as const, system: "", line: "", originId: "1000", originName: "台北", destinationId: "1070", destinationName: "左營", tracked: false, createdAt: new Date(), sortOrder: 0, ...overrides });
const later = (minutes: number) => ({ at: Date.now() + minutes * 60_000, arrivesAt: Date.now() + (minutes + 94) * 60_000, trainNo: String(600 + minutes), kind: null, toward: "左營" });
const stationsOf = (...rows: [id: string, name: string][]) => rows.map(([id, name]) => ({ id, name }));
const METRO_STATIONS = stationsOf(["BL01", "頂埔"], ["BL06", "府中"], ["BL12", "台北車站"], ["BL23", "南港展覽館"], ["R02", "象山"], ["R10", "台北車站"], ["R28", "淡水"], ["BR01", "動物園"], ["BR24", "南港展覽館"], ["Y07", "大坪林"], ["A1", "臺北車站"], ["A12", "機場第一航廈"]);
const METRO_NETWORK = {
  stations: METRO_STATIONS,
  lines: [
    { id: "BL", system: "TRTC", stationIds: ["BL01", "BL06", "BL12", "BL23"] },
    { id: "BR", system: "TRTC", stationIds: ["BR01", "BR24"] },
    { id: "R", system: "TRTC", stationIds: ["R02", "R10", "R28"] },
    { id: "Y", system: "NTMC", stationIds: ["Y07"] },
    { id: "A", system: "TYMC", stationIds: ["A1", "A12"] },
  ],
};
const networkRead = (data = {}) => ({ ok: true, data: { network: METRO_NETWORK, missing: [], problem: null, ...data } });
const html = async (params: Record<string, string> = {}) => {
  const stream = await renderToReadableStream((await TransitBody({ searchParams: Promise.resolve(params) })) as ReactElement);
  await stream.allReady;
  return new Response(stream).text();
};
const render = async (params: Record<string, string> = {}) => textOf(await html(params));

beforeEach(() => {
  requireModule.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedRoutes.mockReset().mockResolvedValue([]);
  cached.cachedStations.mockReset().mockResolvedValue({ ok: true, data: STATIONS });
  cached.cachedMetroNetwork.mockReset().mockResolvedValue(networkRead());
  cached.cachedDepartures.mockReset().mockResolvedValue({ ok: true, data: [later(10), later(20), later(30)] });
  cached.cachedMetroDepartures.mockReset().mockResolvedValue({ ok: true, data: [] });
  cached.cachedLive.mockReset().mockResolvedValue({ ok: true, data: { kind: "none" } });
  cached.cachedBusRoute.mockReset().mockResolvedValue({ ok: true, data: [{ direction: 0, name: "臺北車站", stops: [{ id: "TPE1", name: "板橋" }, { id: "TPE2", name: "西門" }] }, { direction: 1, name: "板橋", stops: [{ id: "TPE3", name: "西門" }] }] });
  cached.cachedBusEta.mockReset().mockResolvedValue({ ok: true, data: { TPE1: { seconds: 200, status: null }, TPE2: { seconds: null, status: "末班車已過" } } });
  cached.cachedBusSchedule.mockReset().mockResolvedValue({ ok: true, data: { headway: { min: 8, max: 12 }, departures: [] } });
  cached.cachedThsrFares.mockReset().mockResolvedValue({ ok: true, data: null });
  cached.cachedTraFares.mockReset().mockResolvedValue({ ok: true, data: null });
  cached.cachedMetroFare.mockReset().mockResolvedValue({ ok: true, data: null });
  cached.cachedMetroTravelTimes.mockReset().mockResolvedValue({ ok: true, data: null });
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
    expect(await html({ mode: "thsr", from: "1000", to: "1070" })).toContain('aria-label="把 610 車次加到常用"');
  });

  it("常用路線滿了_不放加入的按鈕", async () => {
    cached.cachedRoutes.mockResolvedValue(Array.from({ length: 12 }, (_, id) => route({ id })));

    expect(await html({ mode: "thsr", from: "1000", to: "1070" })).not.toContain("加到常用");
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

    expect(text).toContain("臺北市公車");
    expect(text).toContain("307");
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

    expect(text).toContain("暫時無法讀取");
    expect(text).not.toContain("TDX 回 500");
  });

  it("使用者遇過 畫面與系統狀態頁都看不到原因：車站清單讀不到時要記到系統狀態頁", async () => {
    cached.cachedStations.mockResolvedValue({ ok: false, problem: "TDX 回 401" });

    expect(await render()).toContain("車站資料暫時無法讀取");
    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 401");
  });

  it("讀到了要清掉之前的錯誤 不然修好了系統狀態頁還是紅的", async () => {
    await render();

    expect(reportTdx).toHaveBeenLastCalledWith(null);
  });

  it("車站從快取讀到、時刻表讀不到_系統狀態要記下這個問題，不能蓋成沒事", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: false, problem: "TDX 回 429" });

    await render({ mode: "thsr", from: "1000", to: "1070", date: taipeiDateKey(new Date()) });

    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 429");
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

  it("使用者要的：捷運的起訖站都用搜尋視窗 不選系統也不選方向", async () => {
    const markup = await html({ mode: "metro", from: "BL06" });

    expect(markup).toContain('aria-label="起站：府中"');
    expect(markup).toContain('aria-label="迄站：請選擇"');
    expect(markup).not.toContain("<select");
    expect(markup).toContain('aria-label="交換起站與迄站"');
    expect(textOf(markup)).not.toContain("捷運系統");
  });

  it("只有捷運才讀路網 台鐵的縣市在車站清單裡 不多用額度", async () => {
    await render({ mode: "tra" });
    await render({ mode: "thsr" });
    await render({ mode: "bus" });
    expect(cached.cachedMetroNetwork).not.toHaveBeenCalled();

    cached.cachedStations.mockClear();
    await render({ mode: "metro" });
    expect(cached.cachedMetroNetwork).toHaveBeenCalledOnce();
    expect(cached.cachedStations).not.toHaveBeenCalled();
  });

  it("路線讀不到_頁面照常 問題記到系統狀態頁", async () => {
    cached.cachedMetroNetwork.mockResolvedValue(networkRead({ network: { stations: METRO_STATIONS, lines: [] }, missing: ["TRTC", "NTMC", "TYMC"], problem: "TDX 回 404" }));

    expect(await html({ mode: "metro" })).toContain('aria-label="起站：請選擇"');
    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 404");
  });

  it("路網全部讀不到_說明讀不到 也記到系統狀態頁", async () => {
    cached.cachedMetroNetwork.mockResolvedValue({ ok: false, problem: "TDX 回 401" });

    expect(await render({ mode: "metro", from: "BL06", to: "R28" })).toContain("車站資料暫時無法讀取");
    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 401");
  });

  it("台鐵照車站清單的縣市分組", async () => {
    cached.cachedStations.mockResolvedValue({ ok: true, data: [{ id: "1020", name: "板橋", city: "新北市" }, { id: "0900", name: "基隆", city: "基隆市" }] });

    await render({ mode: "tra" });

    expect(groupNames()).toEqual(["基隆市", "新北市"]);
  });

  it("捷運照路線分組 路線讀不到時退回完整清單 不能讓人選不了站", async () => {
    await render({ mode: "metro" });
    expect(groupNames()).toEqual(["板南線", "文湖線", "淡水信義線", "環狀線", "機場線"]);

    cached.cachedMetroNetwork.mockResolvedValue(networkRead({ network: { stations: METRO_STATIONS, lines: [] }, missing: ["TRTC", "NTMC", "TYMC"], problem: "TDX 回 500" }));
    await render({ mode: "metro" });
    expect(formProps().groups).toEqual([]);
    expect(formProps().stations).toEqual(METRO_STATIONS);
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

  it("每一班都有車次與星星（使用者要的：有車次才加入常用），報讀器念得出是哪一班", async () => {
    const markup = await html(search);

    for (const trainNo of ["610", "620", "630"]) {
      expect(textOf(markup)).toContain(`${trainNo} 車次`);
      expect(markup).toContain(`aria-label="把 ${trainNo} 車次加到常用"`);
    }
    expect(markup).not.toContain("加到常用路線");
  });

  it("使用者要的：班次多時分頁 一頁 10 班 下面有頁碼", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: Array.from({ length: 23 }, (_, index) => later(10 + index * 10)) });

    const markup = await html(search);
    const pages = /<nav aria-label="班次的頁數"[\s\S]*?<\/nav>/.exec(markup)?.[0] ?? "";

    expect(markup.match(/車次加到常用/g)).toHaveLength(10);
    expect(textOf(markup)).toContain("共 23 班");
    expect(pages.match(/aria-label="第 \d+ 頁"/g)).toHaveLength(3);
    expect(pages).toMatch(/aria-current="page"[^>]*>1</);
  });

  it("不滿一頁沒有頁碼", async () => {
    expect(await html(search)).not.toContain("班次的頁數");
  });

  it("使用者要的：站名只寫一次 不再疊一塊重複的站牌", async () => {
    expect((await render({ ...search, mode: "tra" })).match(/台北/g)).toHaveLength(1);
  });

  it("寫出總共幾班與每班要坐多久", async () => {
    const text = await render(search);

    expect(text).toContain("共 3 班");
    expect(text).toContain("1 小時 34 分");
  });

  it("已經存過的那一班寫已在常用，其他班照樣能加", async () => {
    cached.cachedRoutes.mockResolvedValue([route({ line: "620" })]);

    const markup = await html(search);

    expect(markup.match(/aria-label="已在常用"/g)).toHaveLength(1);
    expect(markup.match(/車次加到常用"/g)).toHaveLength(2);
  });

  it("別段路存了同一個車次_不算已在常用", async () => {
    cached.cachedRoutes.mockResolvedValue([route({ line: "620", destinationId: "1040" })]);

    expect(await html(search)).not.toContain("已在常用");
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
});


describe("高鐵與台鐵的查詢結果：標籤", () => {
  const thsr = { mode: "thsr", from: "1000", to: "1070" };
  // 幾天後的日期 不是今天 標籤不受現在幾點影響
  const FUTURE = taipeiDateKey(new Date(Date.now() + 10 * DAY_MS));
  const stamp = (clock: string) => Date.parse(`${FUTURE}T${clock}:00+08:00`);
  const train = (clock: string, ride = 94, extra = {}) => ({ at: stamp(clock), arrivesAt: stamp(clock) + ride * 60_000, trainNo: clock.replace(":", ""), kind: null, toward: "左營", ...extra });
  const onDate = (date = FUTURE) => ({ ...thsr, date });

  it("使用者要的：不再照早上 下午 晚上分組", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [train("08:00"), train("13:00"), train("19:00")] });

    const text = await render(onDate());

    for (const part of ["早上", "下午", "晚上"]) expect(text).not.toContain(part);
  });

  it("每一班都寫往哪裡", async () => {
    expect((await render(thsr)).match(/往左營/g)).toHaveLength(3);
  });

  it("今天的第一班標下一班 只標一班", async () => {
    expect((await render(thsr)).match(/下一班/g)).toHaveLength(1);
  });

  it("選了出發時間 第一班不是真正的下一班_不標", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-11-05T10:00:00+08:00");
    const clock = (hour: number) => ({ at: Date.parse(`2026-11-05T${hour}:00:00+08:00`), arrivesAt: Date.parse(`2026-11-05T${hour + 1}:30:00+08:00`), trainNo: String(hour), kind: null, toward: "左營" });
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [clock(11), clock(15), clock(18)] });

    const text = await render({ ...thsr, time: "14:00" });
    vi.useRealTimers();

    expect(text).not.toContain("下一班");
  });

  it("選的時間還包含真正的下一班_照標", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-11-05T10:00:00+08:00");
    const clock = (hour: number) => ({ at: Date.parse(`2026-11-05T${hour}:00:00+08:00`), arrivesAt: Date.parse(`2026-11-05T${hour + 1}:30:00+08:00`), trainNo: String(hour), kind: null, toward: "左營" });
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [clock(11), clock(15)] });

    const text = await render({ ...thsr, time: "10:30" });
    vi.useRealTimers();

    expect(text).toContain("下一班");
  });

  it("別天的查詢不標下一班", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [train("08:00"), train("09:00")] });

    expect(await render(onDate())).not.toContain("下一班");
  });

  it("坐得最短的那班標最快 只標一班", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [train("08:00", 120), train("09:00", 94), train("10:00", 120)] });

    const text = await render(onDate());

    expect(text.match(/最快/g)).toHaveLength(1);
    expect(text.indexOf("最快")).toBeGreaterThan(text.indexOf("0900 車次"));
    expect(text.indexOf("最快")).toBeLessThan(text.indexOf("1000 車次"));
  });

  it("每班都一樣久就沒有最快", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [train("08:00"), train("09:00")] });

    expect(await render(onDate())).not.toContain("最快");
  });

  it("使用者要的：高鐵是車票 寫起訖站名 台鐵是時刻表列", async () => {
    const ticket = await html(thsr);
    expect(ticket.match(/trn-ticket"/g)).toHaveLength(3);
    expect(ticket).not.toContain("trn-result\"");
    expect(textOf(/<li class="trn-ticket"[\s\S]*?<\/li>/.exec(ticket)![0])).toMatch(/台北.*1 小時 34 分.*左營/);

    cached.cachedStations.mockResolvedValue({ ok: true, data: [{ id: "1000", name: "臺北", city: "臺北市" }, { id: "4400", name: "高雄", city: "高雄市" }] });
    const row = await html({ mode: "tra", from: "1000", to: "4400" });
    expect(row.match(/trn-result"/g)).toHaveLength(3);
    expect(row).not.toContain("trn-ticket");
  });

  it("台鐵的車種用顏色標出來 高鐵沒有車種", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [train("08:00", 94, { kind: "自強3000" }), train("09:00", 94, { kind: "莒光" }), train("10:00", 94, { kind: "區間快" })] });

    const markup = await html({ mode: "tra", from: "1000", to: "1070", date: FUTURE });

    expect(markup).toMatch(/chip-danger[^>]*>自強3000/);
    expect(markup).toMatch(/chip-warning[^>]*>莒光/);
    expect(markup).toMatch(/chip-accent[^>]*>區間快/);
  });

  it("使用者不喜歡灰字：查詢結果裡沒有灰色的字", async () => {
    cached.cachedRoutes.mockResolvedValue([route({ line: "620" })]);

    expect(/<section[\s\S]*?<\/section>/.exec(await html(thsr))![0]).not.toContain("text-ink-soft");
  });
});

describe("捷運：任兩站的路線與轉乘", () => {
  const search = { mode: "metro", from: "BL06", to: "R28" };
  const soon = (minutes: number, towardId = "BL23", toward = "南港展覽館") => ({ at: Date.now() + minutes * 60_000, arrivesAt: null, trainNo: null, kind: null, toward, towardId });
  const TODAY = () => taipeiDateKey(new Date());

  beforeEach(() => {
    cached.cachedMetroDepartures.mockResolvedValue({ ok: true, data: [soon(-10), soon(2), soon(8), soon(14), soon(20)] });
  });

  it("使用者的例子：府中到淡水 列出每一段的路線 方向 起訖與轉乘", async () => {
    const text = await render(search);

    expect(text).toContain("府中 → 淡水");
    expect(text).toMatch(/府中.*板南線.*往南港展覽館.*台北車站.*轉乘.*淡水信義線.*往淡水.*淡水/);
  });

  it("路線上只有轉乘的站寫轉乘 最後一段沒有", async () => {
    const route = /<ol aria-label="怎麼搭"[\s\S]*?<\/ol>/.exec(await html(search))?.[0] ?? "";

    expect(textOf(route).match(/轉乘/g)).toHaveLength(1);
  });

  it("使用者要的：下一班寫還有幾分幾秒 後面再列兩班 開走的不列", async () => {
    const markup = await html(search);
    const later = /<ul aria-label="之後的班次"[^>]*>(.*?)<\/ul>/.exec(markup)?.[1] ?? "";

    expect(cached.cachedMetroDepartures).toHaveBeenCalledWith("TRTC", "BL06", TODAY());
    expect(textOf(markup, { spaced: true })).toMatch(/下一班 往南港展覽館 \d+ 分 \d+ 秒/);
    expect(later.match(/<li/g)).toHaveLength(2);
  });

  it("中途折返的車有停到要下車的站也列 寫出開往哪裡 反方向的不列", async () => {
    cached.cachedMetroDepartures.mockResolvedValue({ ok: true, data: [soon(1, "BL01", "頂埔"), soon(3, "BL12", "台北車站"), soon(6)] });

    const text = textOf(await html(search), { spaced: true });

    expect(text).toMatch(/下一班 往台北車站 \d+ 分/);
    expect(text).not.toContain("往頂埔");
  });

  it("跨系統時第一段用它自己的系統讀時刻表", async () => {
    await render({ mode: "metro", from: "A12", to: "R28" });

    expect(cached.cachedMetroDepartures).toHaveBeenCalledWith("TYMC", "A12", TODAY());
  });

  it("使用者要的：文湖線沒有站別時刻表 讀到空的時寫到站看看板 路線照樣列出來", async () => {
    cached.cachedMetroDepartures.mockResolvedValue({ ok: true, data: [] });

    const text = await render({ mode: "metro", from: "BR01", to: "BR24" });

    expect(text).toContain("到站看看板");
    expect(text).toContain("文湖線");
    expect(text).toContain("往南港展覽館");
  });

  it("時刻表暫時讀不到（例如額度用完）_照實說，路線照樣列出來，系統狀態記下原因", async () => {
    cached.cachedMetroDepartures.mockResolvedValue({ ok: false, problem: "TDX 回 429" });

    const text = await render({ mode: "metro", from: "BR01", to: "BR24" });

    expect(text).toContain("時刻表暫時無法讀取");
    expect(text).not.toContain("到站看看板");
    expect(text).toContain("文湖線");
    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 429");
  });

  it("今天的車都開走了_寫今天沒有班次 不是叫人看看板", async () => {
    cached.cachedMetroDepartures.mockResolvedValue({ ok: true, data: [soon(-10)] });

    const text = await render(search);

    expect(text).toContain("今天沒有班次了");
    expect(text).not.toContain("到站看看板");
  });

  it("加到常用路線存第一段 跟 addRoute 收的一樣 系統是第一段的", async () => {
    cached.cachedMetroDepartures.mockResolvedValue({ ok: true, data: [soon(2, "A1", "臺北車站")] });
    const markup = await html({ mode: "metro", from: "A12", to: "R28" });

    for (const [name, value] of [["mode", "metro"], ["system", "TYMC"], ["originId", "A12"], ["destinationId", "A1"], ["line", ""]]) {
      expect(markup).toMatch(new RegExp(`<input[^>]*name="${name}"[^>]*value="${value}"|<input[^>]*value="${value}"[^>]*name="${name}"`));
    }
    expect(textOf(markup)).toContain("加到常用路線");
  });

  it("第一段已經存過_寫已在常用", async () => {
    cached.cachedRoutes.mockResolvedValue([route({ mode: "metro", system: "TRTC", originId: "BL06", originName: "府中", destinationId: "BL23", destinationName: "南港展覽館" })]);

    const text = await render(search);

    expect(text).toContain("已在常用");
    expect(text).not.toContain("加到常用路線");
  });

  it("文湖線沒有時刻表就沒有方向 新增會被拒絕 所以不放按鈕", async () => {
    cached.cachedMetroDepartures.mockResolvedValue({ ok: true, data: [] });

    expect(await render({ mode: "metro", from: "BR01", to: "BR24" })).not.toContain("加到常用路線");
  });

  it("常用路線滿了_不放加入的按鈕", async () => {
    cached.cachedRoutes.mockResolvedValue(Array.from({ length: 12 }, (_, id) => route({ id })));

    expect(await render(search)).not.toContain("加到常用路線");
  });

  it("同名的站就是同一站 告訴使用者 不用讀時刻表", async () => {
    const text = await render({ mode: "metro", from: "BL12", to: "R10" });

    expect(text).toContain("同一站");
    expect(cached.cachedMetroDepartures).not.toHaveBeenCalled();
  });

  it("走不到時說查不到 不讀時刻表", async () => {
    expect(await render({ mode: "metro", from: "R28", to: "Y07" })).toContain("查不到這段路線");
    expect(cached.cachedMetroDepartures).not.toHaveBeenCalled();
  });

  it("一個系統讀不到_說出是哪一個 其他照常", async () => {
    cached.cachedMetroNetwork.mockResolvedValue(networkRead({ missing: ["NTMC"], problem: "TDX 回 404" }));

    const text = await render(search);

    expect(text).toContain("環狀線暫時無法讀取");
    expect(text).toContain("板南線");
    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 404");
  });

  it.each([
    ["路線", search],
    ["同一站", { mode: "metro", from: "BL12", to: "R10" }],
    ["查不到", { mode: "metro", from: "R28", to: "Y07" }],
  ])("%s 的結果都能關閉 起站留著", async (_name, params) => {
    expect(/<a [^>]*關閉查詢結果[^>]*>/.exec(await html(params))?.[0]).toContain(`href="/transit?mode=metro&amp;from=${params.from}"`);
  });

  it("使用者不喜歡灰字：路線結果裡沒有灰色的字", async () => {
    expect(/<section[\s\S]*?<\/section>/.exec(await html(search))![0]).not.toContain("text-ink-soft");
  });
});

describe("公車：儲值卡", () => {
  const search = { mode: "bus", system: "Taipei", line: "307" };

  it("使用者要的：路線是卡片上最大的字 縣市與班距也在卡片上", async () => {
    const card = /<header[\s\S]*?<\/header>/.exec(await html(search))![0];

    expect(/<h2[^>]*>(.*?)<\/h2>/.exec(card)?.[1]).toBe("307");
    expect(textOf(card)).toContain("臺北市公車");
    expect(textOf(card)).toContain("現在約 8–12 分鐘一班");
  });

  it("方向是真的連結 選到的方向標出來", async () => {
    const links = [...(await html({ ...search, dir: "1" })).matchAll(/<a [^>]*href="[^"]*line=307[^"]*"[^>]*>/g)].map(([tag]) => tag);

    expect(links).toHaveLength(2);
    expect(links.filter((tag) => tag.includes('aria-current="true"'))).toHaveLength(1);
    expect(links.find((tag) => tag.includes('aria-current="true"'))).toContain("dir=1");
  });

  it("關閉鈕在卡片上 按了回到不查詢的網址", async () => {
    const card = /<header[\s\S]*?<\/header>/.exec(await html(search))![0];

    expect(/<a [^>]*關閉查詢結果[^>]*>/.exec(card)?.[0]).toContain('href="/transit?mode=bus&amp;system=Taipei"');
  });

  it("每一站都能加入 站牌與到站時間在卡片下面", async () => {
    const markup = await html(search);
    const stops = markup.slice(markup.indexOf("</header>"));

    expect(textOf(stops)).toContain("3 分 20 秒");
    expect(textOf(stops).match(/加入/g)).toHaveLength(2);
  });

  it("到站時間讀不到_站牌照樣列出來", async () => {
    cached.cachedBusEta.mockResolvedValue({ ok: false, problem: "TDX 回 500" });

    const text = await render(search);

    expect(text).toContain("到站時間暫時無法讀取");
    expect(text).toContain("板橋");
  });

  it("使用者不喜歡灰字：結果裡沒有灰色的字", async () => {
    expect(/<section[\s\S]*?<\/section>/.exec(await html(search))![0]).not.toContain("text-ink-soft");
  });
});

describe("票價", () => {
  const thsr = { mode: "thsr", from: "1000", to: "1070" };
  const tra = { mode: "tra", from: "1000", to: "4400" };
  const CABINS = [{ cabin: "標準", price: 1490 }, { cabin: "商務", price: 2440 }, { cabin: "自由", price: 1445 }];
  const onTrain = (minutes: number, kind: string, fareKey?: { trainType: number; direction: number }) => ({ ...later(minutes), kind, ...(fareKey ? { fareKey } : {}) });
  const EXPRESS = { trainType: 3, direction: 1 };
  const LOCAL = { trainType: 6, direction: 1 };
  const TRA_FARES = [{ trainType: 3, direction: 0, price: 1286 }, { trainType: 3, direction: 1, price: 994 }, { trainType: 6, direction: 1, price: 394 }];

  it("還沒選好起訖站不問票價 免費額度有限", async () => {
    await render({ mode: "thsr", from: "1000" });
    await render({ mode: "tra", to: "4400" });

    expect(cached.cachedThsrFares).not.toHaveBeenCalled();
    expect(cached.cachedTraFares).not.toHaveBeenCalled();
  });

  it("使用者要的：高鐵的標準 商務 自由全票在標題寫一次 不是每張票都寫", async () => {
    cached.cachedThsrFares.mockResolvedValue({ ok: true, data: CABINS });

    const text = await render(thsr);

    expect(cached.cachedThsrFares).toHaveBeenCalledWith("1000", "1070");
    expect(text).toContain("標準 1,490 元");
    expect(text).toContain("商務 2,440 元");
    expect(text).toContain("自由 1,445 元");
    expect(text.match(/1,490 元/g)).toHaveLength(1);
  });

  it("高鐵讀不到票價_班次照列 不寫價錢", async () => {
    const text = await render(thsr);

    expect(text).toContain("610 車次");
    expect(text).not.toContain("元");
  });

  it("使用者要的：台鐵每一班寫同一種車 同一個方向的全票", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [onTrain(10, "自強", EXPRESS), onTrain(20, "區間", LOCAL)] });
    cached.cachedTraFares.mockResolvedValue({ ok: true, data: TRA_FARES });

    const markup = await html(tra);
    const rows = [...markup.matchAll(/<li class="trn-result"[\s\S]*?<\/li>/g)].map(([row]) => textOf(row));

    expect(rows[0]).toContain("994 元");
    expect(rows[0]).not.toContain("1,286");
    expect(rows[1]).toContain("394 元");
    expect(textOf(markup)).not.toContain("元起");
  });

  it("使用者要的：認不得的車種那一班不寫 標題的起價只算列出來的班次 沒有列出來的區間 394 不算", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: true, data: [onTrain(10, "自強", EXPRESS), onTrain(20, "觀光列車", { trainType: 99, direction: 1 })] });
    cached.cachedTraFares.mockResolvedValue({ ok: true, data: [{ trainType: 6, direction: 0, price: 100 }, ...TRA_FARES] });

    const markup = await html(tra);
    const rows = [...markup.matchAll(/<li class="trn-result"[\s\S]*?<\/li>/g)].map(([row]) => textOf(row));

    expect(rows[1]).not.toContain("元");
    expect(textOf(markup)).toContain("994 元起");
  });

  it("使用者要的：少了票價不是 TDX 出問題 系統狀態頁不變紅", async () => {
    await render(thsr);

    expect(reportTdx).toHaveBeenLastCalledWith(null);
  });

  it("額度用完讀不到票價_班次照列 問題記到系統狀態頁", async () => {
    cached.cachedTraFares.mockResolvedValue({ ok: false, problem: "TDX 回 429" });

    const text = await render(tra);

    expect(text).toContain("610 車次");
    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 429");
  });
});

describe("捷運的總時間與票價", () => {
  const search = { mode: "metro", from: "BL06", to: "R28" };
  const TIMES = { TRTC: { runs: { "BL06>BL12": 600, "R10>R28": 1800 }, stops: {} }, TYMC: { runs: { "A12>A1": 2100 }, stops: {} } };

  beforeEach(() => {
    cached.cachedMetroTravelTimes.mockImplementation(async (system: keyof typeof TIMES) => ({ ok: true, data: TIMES[system] ?? null }));
  });

  it("使用者要的：每段的時間加起來 每轉一次加固定的時間 10 + 30 + 5", async () => {
    expect(await render(search)).toContain("約 45 分鐘");
  });

  it("每個系統只讀一次 整個系統的行車時間大家共用", async () => {
    await render(search);

    expect(cached.cachedMetroTravelTimes.mock.calls).toEqual([["TRTC"]]);
  });

  it("有一段算不出來就不寫時間 不能少算一段", async () => {
    cached.cachedMetroTravelTimes.mockResolvedValue({ ok: true, data: { runs: { "BL06>BL12": 600 }, stops: {} } });

    expect(await render(search)).not.toContain("分鐘");
  });

  it("同一個系統裡寫票價 問的是真的上下車的站", async () => {
    cached.cachedMetroFare.mockResolvedValue({ ok: true, data: 45 });

    expect(await render(search)).toContain("票價 45 元");
    expect(cached.cachedMetroFare).toHaveBeenCalledWith("TRTC", "BL06", "R28");
  });

  it("使用者要的：跨進機場捷運沒有合併的票價 不問也不寫 時間照算", async () => {
    const text = await render({ mode: "metro", from: "A12", to: "R28" });

    expect(cached.cachedMetroFare).not.toHaveBeenCalled();
    expect(text).not.toContain("票價");
    expect(text).toContain("約 70 分鐘");
  });

  it("同一站或走不到時不問", async () => {
    await render({ mode: "metro", from: "BL12", to: "R10" });
    await render({ mode: "metro", from: "BL06", to: "Y07" });

    expect(cached.cachedMetroFare).not.toHaveBeenCalled();
    expect(cached.cachedMetroTravelTimes).not.toHaveBeenCalled();
  });

  it("使用者要的：少了票價或時間不是 TDX 出問題", async () => {
    cached.cachedMetroTravelTimes.mockResolvedValue({ ok: true, data: null });

    await render(search);

    expect(reportTdx).toHaveBeenLastCalledWith(null);
  });

  it("額度用完時路線照列 問題記到系統狀態頁", async () => {
    cached.cachedMetroFare.mockResolvedValue({ ok: false, problem: "TDX 回 429" });

    const text = await render(search);

    expect(text).toContain("淡水信義線");
    expect(reportTdx).toHaveBeenLastCalledWith("TDX 回 429");
  });

  it("使用者要的：每一站寫站牌代碼 文湖線的深色字來自路線色", async () => {
    const markup = await html({ mode: "metro", from: "BR01", to: "BR24" });

    expect(textOf(markup)).toMatch(/BR01.*動物園/);
    expect(textOf(markup)).toMatch(/BR24.*南港展覽館/);
    expect(markup).toContain("--trn-plate-ink:#15171c");
  });

  it("標題用共用的場景圖 三種交通工具各一張", async () => {
    expect(await html(search)).toContain("/images/scenes/transit-metro.svg");
    expect(await html({ mode: "thsr", from: "1000", to: "1070" })).toContain("/images/scenes/transit-thsr.svg");
    expect(await html({ mode: "tra", from: "1000", to: "1070" })).toContain("/images/scenes/transit-tra.svg");
  });
});

describe("版面：查詢與自己的路線分開（使用者選的）", () => {
  const search = { mode: "thsr", from: "1000", to: "1070" };
  const sideOf = (page: string) => page.match(/<aside[\s\S]*<\/aside>/)?.[0] ?? "";

  it("追蹤與常用都在旁邊的欄 查詢結果不會把它們推到最下面", async () => {
    cached.cachedRoutes.mockResolvedValue([route({ id: 1, tracked: true, line: "610" }), route({ id: 2, line: "620" })]);

    const page = await html(search);

    expect(textOf(sideOf(page))).toContain("追蹤中");
    expect(textOf(sideOf(page))).toContain("常用路線");
    expect(textOf(sideOf(page))).not.toContain("查詢結果");
    expect(page.replace(sideOf(page), "")).toContain("查詢結果");
  });

  it("手機上有路線才排在查詢前面 沒有路線時空狀態不能擋在前面", async () => {
    expect(await html()).toMatch(/<aside[^>]*data-empty/);

    cached.cachedRoutes.mockResolvedValue([route()]);
    expect(await html()).not.toMatch(/<aside[^>]*data-empty/);
  });
});

describe("查完表單收成一行（使用者選的）", () => {
  const search = { mode: "thsr", from: "1000", to: "1070" };

  it("還沒查 欄位都在", async () => {
    const text = await render({ mode: "thsr" });

    expect(text).toContain("起站");
    expect(text).not.toContain("修改");
  });

  it("查到結果 欄位收起來 結果上有修改", async () => {
    const text = await render(search);

    expect(text).not.toContain("起站");
    expect(text).toContain("修改");
  });

  it("交通工具的分頁留著 不用先打開表單才能換", async () => {
    expect(await render(search)).toContain("捷運");
  });

  it("時刻表讀不到 沒有結果可以改 欄位要開著", async () => {
    cached.cachedDepartures.mockResolvedValue({ ok: false, problem: "TDX 回 429" });

    const text = await render(search);

    expect(text).toContain("時刻表暫時無法讀取");
    expect(text).toContain("起站");
  });

  it("公車查不到路線 欄位要開著才能改路線名稱", async () => {
    cached.cachedBusRoute.mockResolvedValue({ ok: true, data: [] });

    const text = await render({ mode: "bus", line: "999" });

    expect(text).toContain("找不到這條路線");
    expect(text).toContain("路線");
    expect(await html({ mode: "bus", line: "999" })).toContain("<input");
  });

  it("捷運查到路線 欄位也收起來", async () => {
    expect(await render({ mode: "metro", from: "BL12", to: "BL23" })).not.toContain("起站");
  });
});

describe("每分鐘只有 5 次：查詢先問 常用路線排後面", () => {
  it("常用路線還在等下一分鐘時 查詢表單已經能用", async () => {
    cached.cachedRoutes.mockResolvedValue([route()]);
    cached.cachedDepartures.mockReturnValue(new Promise(() => {}));

    const page = textOf(renderToStaticMarkup((await TransitBody({ searchParams: Promise.resolve({ mode: "thsr" }) })) as ReactElement));

    expect(page).toContain("查詢");
    expect(page).toContain("載入常用路線…");
  });

  it("車站問完才問常用路線 不能讓常用路線先把次數用完", async () => {
    cached.cachedRoutes.mockResolvedValue([route()]);
    let release: (value: unknown) => void = () => {};
    cached.cachedStations.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const page = render({ mode: "thsr" });
    await vi.waitFor(() => expect(cached.cachedStations).toHaveBeenCalled());
    expect(cached.cachedDepartures).not.toHaveBeenCalled();

    release({ ok: true, data: STATIONS });
    await page;
    expect(cached.cachedDepartures).toHaveBeenCalled();
  });
});

describe("每分鐘只有 5 次：先問時刻表 票價與總時間排後面", () => {
  /** 時刻表先卡住 看這時候有沒有人去問多的資料 */
  function holdDepartures() {
    let release: (value: unknown) => void = () => {};
    cached.cachedDepartures.mockReturnValue(new Promise((resolve) => (release = resolve)));
    return () => release({ ok: true, data: [later(10)] });
  }

  it("台鐵：時刻表問完才問票價 不能讓多的資料佔掉次數", async () => {
    const release = holdDepartures();

    const page = render({ mode: "tra", from: "1000", to: "4400" });
    await vi.waitFor(() => expect(cached.cachedDepartures).toHaveBeenCalled());
    expect(cached.cachedTraFares).not.toHaveBeenCalled();

    release();
    await page;
    expect(cached.cachedTraFares).toHaveBeenCalledWith("1000", "4400");
  });

  it("高鐵：時刻表問完才問票價", async () => {
    const release = holdDepartures();

    const page = render({ mode: "thsr", from: "1000", to: "1070" });
    await vi.waitFor(() => expect(cached.cachedDepartures).toHaveBeenCalled());
    expect(cached.cachedThsrFares).not.toHaveBeenCalled();

    release();
    await page;
    expect(cached.cachedThsrFares).toHaveBeenCalledWith("1000", "1070");
  });

  it("捷運：時刻表問完才問票價與行車時間", async () => {
    let release: (value: unknown) => void = () => {};
    cached.cachedMetroDepartures.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const page = render({ mode: "metro", from: "BL12", to: "BL01" });
    await vi.waitFor(() => expect(cached.cachedMetroDepartures).toHaveBeenCalled());
    expect(cached.cachedMetroFare).not.toHaveBeenCalled();
    expect(cached.cachedMetroTravelTimes).not.toHaveBeenCalled();

    release({ ok: true, data: [] });
    await page;
    expect(cached.cachedMetroFare).toHaveBeenCalled();
    expect(cached.cachedMetroTravelTimes).toHaveBeenCalled();
  });
});
