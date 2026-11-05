import { describe, expect, it } from "vitest";
import { mockRequest } from "@/dev/mock-request";
import { metroNetwork, planRoute } from "../../lib/metro-route";
import { METRO_SYSTEMS, type MetroSystem } from "../../lib/modes";
import { cityGroups, lineGroups } from "../../lib/station-groups";
import { metroDirections, parseMetroLines, parseMetroTimetable, parseStations } from "../../lib/timetable";
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
