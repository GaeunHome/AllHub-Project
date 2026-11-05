import { describe, expect, it } from "vitest";
import { mockRequest } from "@/dev/mock-request";
import { cityGroups, lineGroups } from "../../lib/station-groups";
import { parseMetroLines, parseStations } from "../../lib/timetable";
import { handle } from "../mock.mjs";

const rail = async (path: string) => mockRequest(handle, `/api/basic/v2/Rail/${path}`);
const dataOf = async (path: string) => (await rail(path)).data;

// 假伺服器要回真實格式的資料 本機才看得到分組
describe("假 TDX 的車站分組", () => {
  it("台鐵的車站都分得進縣市 新竹與嘉義的縣市併成一組", async () => {
    const groups = cityGroups(parseStations(await dataOf("TRA/Station")));

    expect(groups.map((group) => group.name)).toContain("新竹");
    expect(groups.map((group) => group.name)).toContain("嘉義");
    expect(groups.map((group) => group.name)).not.toContain("其他");
    expect(groups.find((group) => group.name === "新竹")!.stations.length).toBeGreaterThan(1);
  });

  it("捷運的車站都在路線上 有同一個代碼在兩條線的轉乘站", async () => {
    const groups = lineGroups("TRTC", parseStations(await dataOf("Metro/Station/TRTC")), parseMetroLines(await dataOf("Metro/StationOfLine/TRTC")));
    const ids = groups.flatMap((group) => group.stations.map((station) => station.id));

    expect(groups.map((group) => group.name)).not.toContain("其他");
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });
});
