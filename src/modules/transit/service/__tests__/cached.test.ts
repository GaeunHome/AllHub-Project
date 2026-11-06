import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, byUrl } from "@/dev/fake-fetch";
import { stubCoreEnv, stubTransitEnv } from "@/dev/test-env";
import { captureErrorLog, tagged } from "@/dev/test-helpers";

stubCoreEnv();
stubTransitEnv();

const { cachedMetroFare, cachedMetroNetwork, cachedMetroSystem, cachedMetroTravelTimes, cachedStations, cachedThsrFares, cachedTraFares } = await import("../cached");
const { resetTdx } = await import("../../lib/tdx");

const TOKEN = () => Response.json({ access_token: "the-token", expires_in: 86400 });
const stub = (line: () => Response) => vi.stubGlobal("fetch", fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], [/StationOfLine/, line]])).impl);

beforeEach(() => resetTdx());

describe("一個捷運系統的快取", () => {
  it("讀到時留久一點 車站幾乎不會變 每天第一次打開不用等下一分鐘", async () => {
    stub(() => Response.json([{ LineNo: "R", Stations: [{ Sequence: 1, StationID: "R02", StationName: { Zh_tw: "象山" } }] }]));

    expect(await cachedMetroSystem("TRTC")).toEqual({ ok: true, data: { stations: [{ id: "R02", name: "象山" }], lines: [{ id: "R", stationIds: ["R02"] }] } });
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("stations");
    expect(tagged()).toEqual(["transit:external"]);
  });

  it("讀不到或欄位不同時幾分鐘後再試 不能把沒有分組留一天", async () => {
    captureErrorLog();
    stub(() => new Response("", { status: 500 }));
    await cachedMetroSystem("TRTC");
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");

    vi.mocked(cacheLife).mockClear();
    stub(() => Response.json([]));
    await cachedMetroSystem("TRTC");
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });
});

describe("車站清單的快取", () => {
  it("高鐵與台鐵的車站也留久一點 讀不到時幾分鐘後再試", async () => {
    vi.stubGlobal("fetch", fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], [/TRA\/Station/, () => Response.json([{ StationID: "1000", StationName: { Zh_tw: "臺北" } }])]])).impl);
    await cachedStations("tra", "");
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("stations");

    vi.mocked(cacheLife).mockClear();
    vi.stubGlobal("fetch", fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], [/TRA\/Station/, () => Response.json([])]])).impl);
    await cachedStations("tra", "");
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });
});

describe("捷運的路網：三個系統併在一起", () => {
  const line = (LineNo: string, StationID: string, name: string) => [{ LineNo, Stations: [{ Sequence: 1, StationID, StationName: { Zh_tw: name } }] }];
  const LINES: Record<string, unknown[]> = { TRTC: line("R", "R10", "台北車站"), NTMC: line("Y", "Y07", "大坪林"), TYMC: line("A", "A1", "臺北車站") };
  const FAILED = () => new Response("", { status: 500 });
  const stubNetwork = (broken: (system: string) => (() => Response) | null = () => null) => {
    const routes = Object.entries(LINES).map(([system, lines]): [RegExp, () => Response] => [new RegExp(`/Metro/StationOfLine/${system}`), broken(system) ?? (() => Response.json(lines))]);
    const fake = fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], ...routes]));
    vi.stubGlobal("fetch", fake.impl);
    return fake;
  };

  it("全部讀到時留久一點 三個系統只問三次 免費會員每分鐘只有 5 次", async () => {
    const fake = stubNetwork();

    const result = await cachedMetroNetwork();

    expect(result).toMatchObject({ ok: true, data: { missing: [], problem: null } });
    expect(result.ok && result.data.network.lines.map((row) => row.id)).toEqual(["R", "Y", "A"]);
    expect(result.ok && result.data.network.stations.map((station) => station.id)).toEqual(["R10", "Y07", "A1"]);
    expect(fake.urls.filter((url) => url.includes("/Metro/"))).toHaveLength(3);
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("stations");
    expect(tagged()).toContain("transit:external");
  });

  it("一個系統讀不到_留其他的並說出是哪個 幾分鐘後再試", async () => {
    captureErrorLog();
    stubNetwork((system) => (system === "NTMC" ? FAILED : null));

    const result = await cachedMetroNetwork();

    expect(result).toMatchObject({ ok: true, data: { missing: ["NTMC"], problem: "TDX 回 500" } });
    expect(result.ok && result.data.network.stations.map((station) => station.id)).toEqual(["R10", "A1"]);
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });

  it("一個系統回空的也算讀不到 不能把沒有車站留一天", async () => {
    stubNetwork((system) => (system === "TYMC" ? () => Response.json([]) : null));

    expect(await cachedMetroNetwork()).toMatchObject({ ok: true, data: { missing: ["TYMC"] } });
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });

  it("全部讀不到才算失敗", async () => {
    captureErrorLog();
    stubNetwork(() => FAILED);

    expect(await cachedMetroNetwork()).toEqual({ ok: false, problem: "TDX 回 500" });
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });
});

describe("票價與行車時間的快取", () => {
  const answer = (route: RegExp, response: () => Response) => vi.stubGlobal("fetch", fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], [route, response]])).impl);
  const THSR = [{ OriginStationID: "1000", DestinationStationID: "1070", Fares: [{ TicketType: 1, FareClass: 1, CabinClass: 1, Price: 1490 }] }];
  const TRA = { ODFares: [{ Direction: 1, TrainType: 3, Fares: [{ TicketType: 1, FareClass: 1, Price: 994 }] }] };
  const METRO = [{ Fares: [{ TicketType: 1, FareClass: 1, Price: 40 }] }];
  const S2S = [{ TrainType: 1, TravelTimes: [{ FromStationID: "BL22", ToStationID: "BL21", RunTime: 109, StopTime: 0 }] }];
  const READS: [name: string, route: RegExp, body: unknown, read: () => Promise<unknown>][] = [
    ["高鐵票價", /THSR\/ODFare/, THSR, () => cachedThsrFares("1000", "1070")],
    ["台鐵票價", /TRA\/ODFare/, TRA, () => cachedTraFares("1000", "4400")],
    ["捷運票價", /Metro\/ODFare/, METRO, () => cachedMetroFare("TRTC", "BL12", "BL01")],
    ["捷運行車時間", /S2STravelTime/, S2S, () => cachedMetroTravelTimes("TRTC")],
  ];

  it.each(READS)("%s：讀到時留一天 票價幾乎不會變 免費額度很緊", async (_name, route, body, read) => {
    answer(route, () => Response.json(body));

    await read();

    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("avatar");
    expect(tagged()).toEqual(["transit:external"]);
  });

  it.each(READS)("%s：空的或讀不到都不能留一天 幾分鐘後再試", async (_name, route, _body, read) => {
    captureErrorLog();
    answer(route, () => Response.json([]));
    await read();
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");

    vi.mocked(cacheLife).mockClear();
    answer(route, () => new Response("", { status: 500 }));
    await read();
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });
});
