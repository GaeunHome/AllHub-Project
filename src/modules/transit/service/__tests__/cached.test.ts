import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, byUrl } from "@/dev/fake-fetch";
import { stubCoreEnv, stubTransitEnv } from "@/dev/test-env";
import { captureErrorLog, tagged } from "@/dev/test-helpers";

stubCoreEnv();
stubTransitEnv();

const { cachedMetroFare, cachedMetroLines, cachedMetroNetwork, cachedMetroTravelTimes, cachedThsrFares, cachedTraFares } = await import("../cached");
const { resetTdxToken } = await import("../../lib/tdx");

const TOKEN = () => Response.json({ access_token: "the-token", expires_in: 86400 });
const stub = (line: () => Response) => vi.stubGlobal("fetch", fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], [/StationOfLine/, line]])).impl);

beforeEach(() => resetTdxToken());

describe("捷運路線的快取", () => {
  it("讀到時留一天 路線幾乎不會變 免費額度很緊", async () => {
    stub(() => Response.json([{ LineNo: "R", Stations: [{ Sequence: 1, StationID: "R02" }] }]));

    expect(await cachedMetroLines("TRTC")).toEqual({ ok: true, data: [{ id: "R", stationIds: ["R02"] }] });
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("avatar");
    expect(tagged()).toEqual(["transit:external"]);
  });

  it("讀不到或欄位不同時幾分鐘後再試 不能把沒有分組留一天", async () => {
    captureErrorLog();
    stub(() => new Response("", { status: 500 }));
    await cachedMetroLines("TRTC");
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");

    vi.mocked(cacheLife).mockClear();
    stub(() => Response.json([]));
    await cachedMetroLines("TRTC");
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });
});

describe("捷運的路網：三個系統併在一起", () => {
  const stationRow = (StationID: string, name: string) => ({ StationID, StationName: { Zh_tw: name } });
  const DATA: Record<string, { stations: unknown[]; lines: unknown[] }> = {
    TRTC: { stations: [stationRow("R10", "台北車站")], lines: [{ LineNo: "R", Stations: [{ Sequence: 1, StationID: "R10" }] }] },
    NTMC: { stations: [stationRow("Y07", "大坪林")], lines: [{ LineNo: "Y", Stations: [{ Sequence: 1, StationID: "Y07" }] }] },
    TYMC: { stations: [stationRow("A1", "臺北車站")], lines: [{ LineNo: "A", Stations: [{ Sequence: 1, StationID: "A1" }] }] },
  };
  const FAILED = () => new Response("", { status: 500 });
  const answers = (broken: (system: string, kind: "Station" | "StationOfLine") => (() => Response) | null) =>
    Object.entries(DATA).flatMap(([system, { stations, lines }]): [RegExp, () => Response][] => [
      [new RegExp(`/Metro/Station/${system}`), broken(system, "Station") ?? (() => Response.json(stations))],
      [new RegExp(`/Metro/StationOfLine/${system}`), broken(system, "StationOfLine") ?? (() => Response.json(lines))],
    ]);
  const stubNetwork = (broken: Parameters<typeof answers>[0] = () => null) => {
    const fake = fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], ...answers(broken)]));
    vi.stubGlobal("fetch", fake.impl);
    return fake;
  };

  it("全部讀到時留一天 每個系統的車站與路線各讀一次 免費額度很緊", async () => {
    const fake = stubNetwork();

    const result = await cachedMetroNetwork();

    expect(result).toMatchObject({ ok: true, data: { missing: [], problem: null } });
    expect(result.ok && result.data.network.lines.map((line) => line.id)).toEqual(["R", "Y", "A"]);
    expect(fake.urls.filter((url) => url.includes("/Metro/"))).toHaveLength(6);
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("avatar");
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
    stubNetwork((system, kind) => (system === "TYMC" && kind === "Station" ? () => Response.json([]) : null));

    expect(await cachedMetroNetwork()).toMatchObject({ ok: true, data: { missing: ["TYMC"] } });
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });

  it("路線讀不到但車站讀得到_車站留著 不能讓人選不了站", async () => {
    captureErrorLog();
    stubNetwork((_system, kind) => (kind === "StationOfLine" ? FAILED : null));

    const result = await cachedMetroNetwork();

    expect(result).toMatchObject({ ok: true, data: { missing: ["TRTC", "NTMC", "TYMC"], problem: "TDX 回 500" } });
    expect(result.ok && result.data.network.stations).toHaveLength(3);
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
