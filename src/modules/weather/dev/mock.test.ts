import { describe, expect, it } from "vitest";
import { mockRequest } from "@/dev/mock-request";
import { aqiResponse, forecastResponse, handle, periodStarts } from "./mock.mjs";

// 假伺服器要回真實格式的資料 網站照真的解析才看得到東西
describe("氣象署與環境部的假回應", () => {
  it("時段跟氣象署一樣從最近的 6 點或 18 點開始，每段 12 小時：台北 13:00 是 06:00 起，凌晨 2:00 是前一天 18:00 起", () => {
    expect(periodStarts(new Date("2026-10-16T05:00:00Z")).map((ms) => new Date(ms).toISOString())).toEqual(["2026-10-15T22:00:00.000Z", "2026-10-16T10:00:00.000Z", "2026-10-16T22:00:00.000Z"]);
    expect(new Date(periodStarts(new Date("2026-10-15T18:00:00Z"))[0]).toISOString()).toBe("2026-10-15T10:00:00.000Z");
  });

  it("預報照 F-C0032-001 的欄位：選的縣市、五個要素各三個時段、時間是 ISO 加 +08:00、值都是字串", () => {
    const [location] = forecastResponse(["臺北市"], new Date("2026-10-16T05:00:00Z")).records.location;
    expect(location.locationName).toBe("臺北市");
    expect(location.weatherElement.map((element) => element.elementName).sort()).toEqual(["CI", "MaxT", "MinT", "PoP", "Wx"]);
    for (const element of location.weatherElement) {
      expect(element.time).toHaveLength(3);
      for (const slot of element.time) {
        expect(slot.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\+08:00$/);
        expect(typeof slot.parameter.parameterName).toBe("string");
      }
    }
  });

  it("跟氣象署一樣：帶 locationName 只回那個縣市，沒帶（早上的下雨提醒全台一次讀）回全部 22 個縣市", async () => {
    const forecast = async (query: string) => {
      const reply = await mockRequest(handle, `/api/v1/rest/datastore/F-C0032-001?Authorization=dev-cwa${query}`);
      return (reply.data as ReturnType<typeof forecastResponse>).records.location.map((location) => location.locationName);
    };

    expect(await forecast("&locationName=高雄市")).toEqual(["高雄市"]);
    const all = await forecast("");
    expect(all).toHaveLength(22);
    expect(new Set(all).size).toBe(22);
  });

  it("截圖照 docs/development.md 挑縣市：臺北市帶傘、高雄市帶把折傘、臺中市不用帶傘，臺南市是最壞情況（描述 11 個字、舒適度 7 個字、帶傘），跟幾點看無關", () => {
    // 現在與下一段裡最高的降雨機率 50% 以上帶傘 30% 以上帶把折傘
    const card = (county: string, now: Date) => {
      const [location] = forecastResponse([county], now).records.location;
      const values = (name: string) => (location.weatherElement.find((element) => element.elementName === name)?.time ?? []).map((slot) => slot.parameter.parameterName);
      const peak = Math.max(...values("PoP").slice(0, 2).map(Number));
      return { level: peak >= 50 ? "umbrella" : peak >= 30 ? "maybe" : "dry", description: [...values("Wx")[0]].length, comfort: [...values("CI")[0]].length };
    };

    for (const now of [new Date("2026-10-18T22:10:00Z"), new Date("2026-10-19T12:00:00Z"), new Date("2026-10-19T17:30:00Z")]) {
      expect(["臺北市", "高雄市", "臺中市"].map((county) => card(county, now).level)).toEqual(["umbrella", "maybe", "dry"]);
      expect(card("臺南市", now)).toEqual({ level: "umbrella", description: 11, comfort: 7 });
    }
  });

  it("空氣品質照 aqx_p_432 的欄位：records 每筆有 county、sitename、aqi（字串，維修中的是空字串）與 publishtime", () => {
    const { records } = aqiResponse(new Date("2026-10-16T05:00:00Z"));
    expect(records.length).toBeGreaterThan(5);
    for (const row of records) expect(Object.keys(row)).toEqual(expect.arrayContaining(["county", "sitename", "aqi", "publishtime"]));
    expect(records.some((row) => row.aqi === "")).toBe(true);
    expect(records[0].publishtime).toBe("2026/10/16 13:00:00");
  });
});
