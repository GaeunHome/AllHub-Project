import { describe, expect, it, vi } from "vitest";
import { mockRequest } from "@/dev/mock-request";
import { parseMetroFare, parseThsrFares, parseTraFares, traFareOf } from "../../lib/fares";
import { fareSystemOf, metroNetwork, planRoute } from "../../lib/metro-route";
import { METRO_SYSTEMS, type MetroSystem } from "../../lib/modes";
import { cityGroups, lineGroups } from "../../lib/station-groups";
import { metroDirections, parseDailyTimetable, parseMetroLines, parseMetroTimetable, parseStations } from "../../lib/timetable";
import { parseTravelTimes, tripMinutes } from "../../lib/travel-time";
import { handle } from "../mock.mjs";

const rail = async (path: string) => mockRequest(handle, `/api/basic/v2/Rail/${path}`);
const dataOf = async (path: string) => (await rail(path)).data;

const SYSTEMS = Object.keys(METRO_SYSTEMS) as MetroSystem[];
const stationsOf = async (system: string) => parseStations(await dataOf(`Metro/Station/${system}`));
const network = async () => metroNetwork(await Promise.all(SYSTEMS.map(async (system) => ({ system, stations: await stationsOf(system), lines: parseMetroLines(await dataOf(`Metro/StationOfLine/${system}`)) }))));
const timetable = (system: string, stationId: string) => dataOf(`Metro/StationTimeTable/${system}?$filter=${encodeURIComponent(`StationID eq '${stationId}'`)}`);

// 假伺服器要回真實格式的資料 本機才看得到分組
describe("假 TDX 的車站分組", () => {
  it("台鐵的車站都分得進縣市 新竹與嘉義的縣市併成一組", async () => {
    const groups = cityGroups(parseStations(await dataOf("TRA/Station")));

    expect(groups.map((group) => group.name)).toContain("新竹");
    expect(groups.map((group) => group.name)).toContain("嘉義");
    expect(groups.map((group) => group.name)).not.toContain("其他");
    expect(groups.find((group) => group.name === "新竹")!.stations.length).toBeGreaterThan(1);
  });

  it("捷運三個系統的車站都在路線上 面板不會多一組其他", async () => {
    const groups = lineGroups(await network());

    expect(groups.map((group) => group.name)).not.toContain("其他");
    expect(groups.map((group) => group.name)).toEqual(["板南線", "文湖線", "松山新店線", "中和新蘆線", "淡水信義線", "環狀線", "機場線"]);
  });
});

describe("假 TDX 的捷運路網", () => {
  it("環狀線只在新北捷運 機場線只在機場捷運 跟真的一樣分開", async () => {
    const ids = async (system: string) => (await stationsOf(system)).map((station) => station.id);

    expect((await ids("TRTC")).some((id) => /^[YA]\d/.test(id))).toBe(false);
    expect((await ids("NTMC")).every((id) => id.startsWith("Y"))).toBe(true);
    expect((await ids("TYMC")).every((id) => id.startsWith("A"))).toBe(true);
  });

  it.each([
    ["BL06", "R28", ["板南線", "淡水信義線"]],
    ["A12", "R28", ["機場線", "淡水信義線"]],
    ["G03A", "G01", ["松山新店線", "松山新店線"]],
  ])("規劃 %s 到 %s 第一段的時刻表查得到下一班", async (from, to, lines) => {
    const legs = planRoute(await network(), from, to)!;
    const [first] = legs;

    expect(legs.map((leg) => leg.line)).toEqual(lines);
    expect(parseMetroTimetable(await timetable(first.system, first.from.id), "2026-11-05", first.towardId).length).toBeGreaterThan(0);
  });

  it("第一段的方向也是新增常用路線查得到的方向", async () => {
    const [first] = planRoute(await network(), "BL06", "R28")!;

    expect(metroDirections(await timetable(first.system, first.from.id))).toContainEqual({ id: first.towardId, name: first.towardName });
  });

  it("文湖線沒有站別時刻表 跟真的一樣回空的", async () => {
    expect(await timetable("TRTC", "BR10")).toEqual([]);
  });

  it("別的系統查不到這一站 跟真的一樣回空的", async () => {
    expect(await timetable("TRTC", "A12")).toEqual([]);
  });
});

describe("假 TDX 的票價 格式跟真的一樣 解析得出來才看得到畫面", () => {
  const traFares = async (from: string, to: string) => parseTraFares((await mockRequest(handle, `/api/basic/v3/Rail/TRA/ODFare/${from}/to/${to}`)).data, from, to).fares;
  const traTrains = async (from: string, to: string) => parseDailyTimetable(await dataOf(`TRA/DailyTimetable/OD/${from}/to/${to}/2026-11-05`), "2026-11-05");
  const metroFare = async (system: string, from: string, to: string) => parseMetroFare(await dataOf(`Metro/ODFare/${system}?$filter=${encodeURIComponent(`OriginStationID eq '${from}' and DestinationStationID eq '${to}'`)}`), from, to).fare;

  it("高鐵台北到左營是真實的票價 其他票種也列著", async () => {
    const data = await dataOf("THSR/ODFare/1000/to/1070");

    expect(parseThsrFares(data, "1000", "1070").fares).toEqual([{ cabin: "標準", price: 1490 }, { cabin: "商務", price: 2440 }, { cabin: "自由", price: 1445 }]);
  });

  it("台鐵一段路兩個方向 繞遠路的比較貴", async () => {
    const fares = await traFares("1000", "4400");
    const local = fares.filter((fare) => fare.trainType === 6);

    expect(local.map((fare) => fare.direction).sort()).toEqual([0, 1]);
    expect(local.find((fare) => fare.direction === 0)!.price).toBeGreaterThan(local.find((fare) => fare.direction === 1)!.price);
  });

  it("台鐵每一班都對得到票價", async () => {
    const fares = await traFares("1000", "4400");

    for (const { fareKey } of await traTrains("1000", "4400")) expect(traFareOf(fares, fareKey)).not.toBeNull();
  });

  it("臺北到基隆故意對不上 本機看得到標題的起價", async () => {
    const fares = await traFares("1000", "0900");

    expect(fares.length).toBeGreaterThan(0);
    for (const { fareKey } of await traTrains("1000", "0900")) expect(traFareOf(fares, fareKey)).toBeNull();
  });

  it("捷運同一個系統有票價 跨進機場捷運是空的", async () => {
    expect(await metroFare("TRTC", "BL06", "R28")).toBeGreaterThanOrEqual(20);
    expect(await metroFare("TRTC", "BL12", "A1")).toBeNull();
    expect(await metroFare("TYMC", "A1", "R28")).toBeNull();
  });

  it.each([
    ["BL06", "R28"],
    ["A12", "R28"],
    ["O54", "O01"],
    ["BL06", "Y10"],
  ])("%s 到 %s 算得出總時間", async (from, to) => {
    const legs = planRoute(await network(), from, to)!;
    const entries = await Promise.all(SYSTEMS.map(async (system) => [system, parseTravelTimes(await dataOf(`Metro/S2STravelTime/${system}`)).times] as const));

    expect(tripMinutes(legs, Object.fromEntries(entries))).toBeGreaterThan(0);
  });

  it("臺北捷運的回應只有一個方向 跟真的一樣 機場捷運是任兩站的表 直達車另外一組", async () => {
    const trtc = (await dataOf("Metro/S2STravelTime/TRTC")) as { LineID: string; TravelTimes: { FromStationID: string; ToStationID: string; StopTime: number }[] }[];
    const blue = trtc.find((row) => row.LineID === "BL")!.TravelTimes;
    const airport = (await dataOf("Metro/S2STravelTime/TYMC")) as { TrainType: number; TravelTimes: unknown[] }[];

    expect(blue[0]).toMatchObject({ FromStationID: "BL23", ToStationID: "BL22", StopTime: 0 });
    expect(blue.some((step) => step.FromStationID === "BL22" && step.ToStationID === "BL23")).toBe(false);
    expect(airport.find((row) => row.TrainType === 1)!.TravelTimes).toHaveLength(13 * 12);
    expect(airport.find((row) => row.TrainType === 2)!.TravelTimes.length).toBeGreaterThan(0);
  });

  it("規劃跨系統的路線時票價問不到 畫面不會顯示", async () => {
    expect(fareSystemOf(planRoute(await network(), "A12", "R28")!)).toBeNull();
  });
});

describe("每分鐘的上限 跟正式環境一樣 第 6 次回 429", () => {
  it("設了 MOCK_TDX_PER_MINUTE 才擋 要等的秒數寫在 Retry-After", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-06T00:00:10Z"), toFake: ["Date"] });
    vi.stubEnv("MOCK_TDX_PER_MINUTE", "5");
    const ask = () => mockRequest(handle, "/api/basic/v2/Rail/THSR/Station");

    for (let call = 0; call < 5; call++) expect((await ask()).status).toBe(200);
    const blocked = await ask();

    expect(blocked.status).toBe(429);
    expect(blocked.headers["Retry-After"]).toBe("50");
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
});
