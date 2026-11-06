import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, byUrl } from "@/dev/fake-fetch";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { stubCoreEnv, stubTransitEnv } from "@/dev/test-env";

stubCoreEnv();
stubTransitEnv({ TDX_CLIENT_SECRET: "tdx-top-secret" });

const { problemOf, readDepartures, readLive, readMetroFare, readMetroSystem, readStations, readThsrFares, readTraFares, readTravelTimes } = await import("../timetable");
const { resetTdx } = await import("../../lib/tdx");

const TOKEN = () => Response.json({ access_token: "the-token", expires_in: 86400 });

function stub(routes: Array<[RegExp, () => Response]>) {
  const fake = fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], ...routes]));
  vi.stubGlobal("fetch", fake.impl);
  return fake;
}

beforeEach(() => resetTdx());

describe("向 TDX 讀資料", () => {
  it("先換 token 再帶著它讀", async () => {
    const fake = stub([[/THSR\/Station/, () => Response.json([{ StationID: "1000", StationName: { Zh_tw: "台北" } }])]]);

    expect(await readStations("thsr", "")).toEqual({ ok: true, data: [{ id: "1000", name: "台北" }] });

    const read = fake.calls.find((call) => call.url.includes("/THSR/Station"))!;
    expect((read.init.headers as Record<string, string>).Authorization).toBe("Bearer the-token");
  });

  it("使用者遇過 log 只寫 401 分不出是誰拒絕：換 token 被拒是金鑰的問題 要說明去改金鑰", async () => {
    const log = captureErrorLog();
    vi.stubGlobal("fetch", fakeFetch(byUrl([[/openid-connect\/token/, () => Response.json({ error: "unauthorized_client" }, { status: 401 })]])).impl);

    const result = await readStations("thsr", "");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toContain("TDX_CLIENT_SECRET");
    expect(loggedText(log)).toContain("TdxKeyError");
    expect(loggedText(log)).not.toContain("tdx-top-secret");
  });

  it("token 換到了 但資料介面回 401 不是金鑰打錯 照實寫狀態碼", async () => {
    captureErrorLog();
    stub([[/THSR\/Station/, () => new Response("invalid token", { status: 401 })]]);

    expect(await readStations("thsr", "")).toEqual({ ok: false, problem: "TDX 回 401" });
  });

  it("token 沿用 不是每次都換 換 token 每分鐘有次數限制", async () => {
    const fake = stub([[/THSR\/Station/, () => Response.json([])]]);

    await readStations("thsr", "");
    await readStations("thsr", "");

    expect(fake.urls.filter((url) => url.includes("openid-connect"))).toHaveLength(1);
  });

  it("高鐵用起訖站與日期的時刻表", async () => {
    const fake = stub([[/DailyTimetable/, () => Response.json([])]]);

    await readDepartures("thsr", "", "1000", "1070", "2026-11-05");

    expect(fake.urls.at(-1)).toContain("/v2/Rail/THSR/DailyTimetable/OD/1000/to/1070/2026-11-05");
  });

  it("捷運用站別時刻表 只查這一站 才不會一次下載全部的站", async () => {
    const fake = stub([[/StationTimeTable/, () => Response.json([])]]);

    await readDepartures("metro", "TRTC", "R10", "R28", "2026-11-05");

    expect(new URL(fake.urls.at(-1)!).searchParams.get("$filter")).toBe("StationID eq 'R10'");
  });

  it("讀不到_回摘要不丟錯 摘要與 log 都不帶金鑰與網址", async () => {
    const log = captureErrorLog();
    stub([[/THSR\/Station/, () => new Response("oops", { status: 500 })]]);

    const result = await readStations("thsr", "");

    expect(result).toEqual({ ok: false, problem: "TDX 回 500" });
    expect(loggedText(log)).not.toContain("tdx-top-secret");
  });

  it("429 寫出是額度用完 站長才知道為什麼", async () => {
    captureErrorLog();
    stub([[/THSR\/Station/, () => new Response("", { status: 429, headers: { "Retry-After": "86400" } })]]);

    expect(await readStations("thsr", "")).toMatchObject({ problem: expect.stringContaining("額度") });
  });

  it("token 暫時換不到_一樣回摘要 不說金鑰錯", async () => {
    captureErrorLog();
    vi.stubGlobal("fetch", fakeFetch(() => new Response("", { status: 503 })).impl);

    expect(await readStations("thsr", "")).toEqual({ ok: false, problem: "TDX 回 503" });
  });
});

describe("捷運每條線的車站", () => {
  const LINE = { LineNo: "R", Stations: [{ Sequence: 1, StationID: "R02", StationName: { Zh_tw: "象山" } }] };

  it("一個系統只問一次 StationOfLine 站名與路線都在裡面 每分鐘只有 5 次", async () => {
    const fake = stub([[/StationOfLine/, () => Response.json([LINE])]]);

    expect(await readMetroSystem("TRTC")).toEqual({ ok: true, data: { stations: [{ id: "R02", name: "象山" }], lines: [{ id: "R", stationIds: ["R02"] }] } });
    expect(fake.urls.filter((url) => url.includes("/Metro/"))).toEqual([expect.stringContaining("/v2/Rail/Metro/StationOfLine/TRTC")]);
  });

  it("轉乘站在同一個系統出現兩次時只算一站", async () => {
    stub([[/StationOfLine/, () => Response.json([LINE, { LineNo: "R", LineID: "R-1", Stations: LINE.Stations }])]]);

    expect(await readMetroSystem("TRTC")).toMatchObject({ ok: true, data: { stations: [{ id: "R02", name: "象山" }] } });
  });

  it("車站清單是空的_當成讀不到，不能在快取裡留一天", async () => {
    stub([[/Station/, () => Response.json([])]]);

    expect(await readStations("metro", "NTMC")).toEqual({ ok: false, problem: "TDX 的車站資料是空的或格式不同" });
  });

  it("介面失敗_回摘要", async () => {
    captureErrorLog();
    stub([[/StationOfLine/, () => new Response("", { status: 404 })]]);

    expect(await readMetroSystem("NTALRT")).toEqual({ ok: false, problem: "TDX 回 404" });
  });

  it("欄位不同讀不出路線_當成讀不到 空的不能留在快取裡一天", async () => {
    stub([[/StationOfLine/, () => Response.json([{ Unknown: true }])]]);

    expect(await readMetroSystem("TRTC")).toMatchObject({ ok: false });
  });

  it("沒有站名時也算讀不到 不能讓人選不了站還留一天", async () => {
    stub([[/StationOfLine/, () => Response.json([{ LineNo: "R", Stations: [{ Sequence: 1, StationID: "R02" }] }])]]);

    expect(await readMetroSystem("TRTC")).toMatchObject({ ok: false });
  });
});

describe("每分鐘用完時 多的資料不等", () => {
  const BUSY = () => new Response("", { status: 429 });

  it.each([
    ["高鐵票價", /THSR\/ODFare/, () => readThsrFares("1000", "1070")],
    ["台鐵票價", /TRA\/ODFare/, () => readTraFares("1000", "4400")],
    ["捷運票價", /Metro\/ODFare/, () => readMetroFare("TRTC", "BL12", "BL01")],
    ["捷運行車時間", /S2STravelTime/, () => readTravelTimes("TRTC")],
    ["即時資料", /LiveBoard/, () => readLive({ mode: "tra", system: "", line: "", originId: "1000", destinationId: "4400" }, new Date())],
  ] as [string, RegExp, () => Promise<unknown>][])("%s：馬上回來 不佔著畫面", async (_name, route, read) => {
    captureErrorLog();
    stub([[route, BUSY]]);

    expect(await read()).toMatchObject({ ok: false, problem: expect.stringContaining("429") });
  });
});

describe("即時資料", () => {
  const NOW = new Date("2026-11-05T00:00:00Z");
  const target = (mode: "thsr" | "tra" | "metro", system: string, originId: string, destinationId: string) => ({ mode, system, line: "", originId, destinationId });

  it("公車用秒數 只算追蹤的站牌與方向", async () => {
    stub([[/EstimatedTimeOfArrival/, () => Response.json([{ StopUID: "A", Direction: 0, EstimateTime: 95, StopStatus: 0 }, { StopUID: "A", Direction: 1, EstimateTime: 5, StopStatus: 0 }])]]);

    expect(await readLive({ mode: "bus", system: "Taipei", line: "307", originId: "A", destinationId: "0" }, NOW)).toEqual({ ok: true, data: { kind: "estimate", seconds: 95, status: null, readAt: NOW.getTime() } });
  });

  it("公車的路線名稱有中文 網址要編碼 只要完全一樣的路線", async () => {
    const fake = stub([[/EstimatedTimeOfArrival/, () => Response.json([])]]);

    await readLive({ mode: "bus", system: "Taipei", line: "紅30", originId: "A", destinationId: "0" }, NOW);

    const url = new URL(fake.urls.at(-1)!);
    expect(url.pathname).toContain(encodeURIComponent("紅30"));
    expect(url.searchParams.get("$filter")).toBe("RouteName/Zh_tw eq '紅30'");
  });

  it("高鐵沒有即時資料 不用問 TDX", async () => {
    const fake = stub([]);

    expect(await readLive(target("thsr", "", "1000", "1070"), NOW)).toEqual({ ok: true, data: { kind: "none" } });
    expect(fake.urls).toEqual([]);
  });

  it("沒有看板的捷運系統 不用問 TDX", async () => {
    const fake = stub([]);

    expect(await readLive(target("metro", "NTMC", "Y01", "Y20"), NOW)).toEqual({ ok: true, data: { kind: "none" } });
    expect(fake.urls).toEqual([]);
  });

  it("台鐵回誤點分鐘", async () => {
    stub([[/TRA\/LiveBoard/, () => Response.json([{ TrainNo: "123", DelayTime: 5 }])]]);

    expect(await readLive(target("tra", "", "1000", "4400"), NOW)).toEqual({ ok: true, data: { kind: "delays", delays: { "123": 5 } } });
  });

  it("捷運回這個方向的分鐘數 與讀到的時間", async () => {
    stub([[/Metro\/LiveBoard/, () => Response.json([{ DestinationStationID: "R28", EstimateTime: 3, ServiceStatus: 0 }])]]);

    expect(await readLive(target("metro", "TRTC", "R10", "R28"), NOW)).toEqual({ ok: true, data: { kind: "estimate", seconds: 180, readAt: NOW.getTime() } });
  });
});

describe("票價與捷運的行車時間", () => {
  const THSR = [{ OriginStationID: "1000", DestinationStationID: "1070", Direction: 0, Fares: [{ TicketType: 1, FareClass: 1, CabinClass: 1, Price: 1490 }] }];
  const TRA = { ODFares: [{ OriginStationID: "1000", DestinationStationID: "4400", Direction: 1, TrainType: 3, Fares: [{ TicketType: 1, FareClass: 1, CabinClass: 1, Price: 994 }] }] };

  it("高鐵問那一段路的票價", async () => {
    const fake = stub([[/THSR\/ODFare/, () => Response.json(THSR)]]);

    expect(await readThsrFares("1000", "1070")).toEqual({ ok: true, data: [{ cabin: "標準", price: 1490 }] });
    expect(fake.urls.some((url) => url.includes("/v2/Rail/THSR/ODFare/1000/to/1070"))).toBe(true);
  });

  it("台鐵用 v3 才有車種", async () => {
    const fake = stub([[/TRA\/ODFare/, () => Response.json(TRA)]]);

    expect(await readTraFares("1000", "4400")).toEqual({ ok: true, data: [{ trainType: 3, direction: 1, price: 994 }] });
    expect(fake.urls.some((url) => url.includes("/v3/Rail/TRA/ODFare/1000/to/4400"))).toBe(true);
  });

  it("捷運用查詢條件指定起訖站 才不用下載整個系統的票價表", async () => {
    const fake = stub([[/Metro\/ODFare\/TRTC/, () => Response.json([{ OriginStationID: "BL12", DestinationStationID: "BL01", Fares: [{ TicketType: 1, FareClass: 1, Price: 40 }] }])]]);

    expect(await readMetroFare("TRTC", "BL12", "BL01")).toEqual({ ok: true, data: 40 });
    const url = decodeURIComponent(fake.urls.find((candidate) => candidate.includes("ODFare"))!.replaceAll("+", " "));
    expect(url).toContain("OriginStationID eq 'BL12' and DestinationStationID eq 'BL01'");
  });

  it("捷運的行車時間一個系統讀一次", async () => {
    stub([[/S2STravelTime\/TRTC/, () => Response.json([{ TrainType: 1, TravelTimes: [{ FromStationID: "BL22", ToStationID: "BL21", RunTime: 109, StopTime: 0 }] }])]]);

    expect(await readTravelTimes("TRTC")).toEqual({ ok: true, data: { runs: { "BL22>BL21": 109 }, stops: {} } });
  });

  it("空的回 null 讓快取函式知道不能留一天", async () => {
    stub([[/ODFare|S2STravelTime/, () => Response.json([])]]);

    expect(await readThsrFares("1000", "1070")).toEqual({ ok: true, data: null });
    expect(await readMetroFare("TRTC", "BL12", "BL01")).toEqual({ ok: true, data: null });
    expect(await readTravelTimes("TRTC")).toEqual({ ok: true, data: null });
  });

  it("欄位不同時只記欄位名稱 價錢與車站都不進 log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stub([[/THSR\/ODFare/, () => Response.json([{ OriginStationID: "1000", DestinationStationID: "1070", Price: 1490 }])]]);

    expect(await readThsrFares("1000", "1070")).toEqual({ ok: true, data: null });
    expect(warn.mock.lastCall?.join(" ")).toContain("Fares");
    expect(warn.mock.lastCall?.join(" ")).not.toMatch(/1490|1070/);
  });

  it("使用者要的：少了票價不是 TDX 出問題 回 404 或不是 JSON 都不算", async () => {
    captureErrorLog();
    stub([[/ODFare/, () => new Response("", { status: 404 })]]);
    expect(await readThsrFares("1000", "1070")).toEqual({ ok: true, data: null });

    stub([[/ODFare/, () => new Response("<html>維護中</html>")]]);
    expect(await readThsrFares("1000", "1070")).toEqual({ ok: true, data: null });
  });

  it("額度用完照實記 站長才看得到原因", async () => {
    captureErrorLog();
    stub([[/ODFare/, () => new Response("", { status: 429 })]]);

    expect(await readThsrFares("1000", "1070")).toEqual({ ok: false, problem: "TDX 回 429：這個月的額度或每分鐘的次數用完了" });
  });
});

describe("problemOf：好幾個讀取一起回報", () => {
  it("都讀到或沒有讀 沒有問題", () => {
    expect(problemOf({ ok: true, data: 1 }, null)).toBeNull();
  });

  it("回報第一個讀不到的原因", () => {
    expect(problemOf({ ok: true, data: 1 }, { ok: false, problem: "第一個" }, { ok: false, problem: "第二個" })).toBe("第一個");
  });
});
