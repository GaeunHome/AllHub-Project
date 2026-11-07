import { describe, expect, it } from "vitest";
import { taipeiDateKey } from "@/core/time";
import { mockRequest } from "@/dev/mock-request";
import { parseCwaTime } from "../../lib/forecast";
import { parseWarnings } from "../../lib/warnings";
import { parseCwaWeek, parseOpenMeteoWeek } from "../../lib/weekly";
import { aqiResponse, forecastResponse, handle, periodStarts, warningResponse } from "../mock.mjs";

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

describe("氣象署 W-C0033-001 的假回應", () => {
  const request = (query: string) => mockRequest(handle, `/api/v1/rest/datastore/W-C0033-001?format=JSON${query}`);

  it("授權碼是空的或 bad 開頭時回 401，像授權碼打錯", async () => {
    expect((await request("")).status).toBe(401);
    expect((await request("&Authorization=bad-key")).status).toBe(401);
  });

  it("跟氣象署一樣：帶 locationName 只回那個縣市，沒帶（排程全台一次讀）回全部 22 個縣市", async () => {
    const names = async (query: string) => ((await request(`&Authorization=dev-cwa${query}`)).data as ReturnType<typeof warningResponse>).records.location.map((location) => location.locationName);

    expect(await names("&locationName=臺南市")).toEqual(["臺南市"]);
    const all = await names("");
    expect(all).toHaveLength(22);
    expect(new Set(all).size).toBe(22);
  });

  it("格式照官方欄位表與公開專案確認的路徑：hazardConditions.hazards[] 的 info 與 validTime，時間是台北時間的舊寫法", () => {
    const [location] = warningResponse(["臺北市"], new Date("2026-11-02T05:20:00Z")).records.location;

    expect(location.hazardConditions.hazards).toHaveLength(1);
    const [hazard] = location.hazardConditions.hazards;
    expect(hazard.info).toEqual({ language: "zh-TW", phenomena: "大雨", significance: "特報" });
    expect(hazard.validTime.startTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:00:00$/);
    expect(hazard.validTime.endTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:00:00$/);
  });

  it("截圖照這份挑縣市：臺北市大雨特報，臺南市是最壞情況（颱風警報、超大豪雨、陸上強風、濃霧），其他縣市沒有特報", () => {
    const { warnings, missing } = parseWarnings(warningResponse(undefined, new Date("2026-11-02T05:20:00Z")));

    expect(missing).toEqual([]);
    expect(warnings?.get("臺北市")?.map(({ label, severe }) => [label, severe])).toEqual([["大雨特報", false]]);
    expect(warnings?.get("臺南市")?.map(({ label, severe }) => [label, severe])).toEqual([
      ["海上陸上颱風警報", true],
      ["超大豪雨特報", false],
      ["陸上強風特報", false],
      ["濃霧特報", false],
    ]);
    expect(warnings?.get("高雄市")).toEqual([]);
    expect(warnings?.get("臺中市")).toEqual([]);
    const others = [...(warnings?.entries() ?? [])].filter(([county]) => county !== "臺北市" && county !== "臺南市");
    expect(others).toHaveLength(20);
    expect(others.every(([, list]) => list.length === 0)).toBe(true);
  });

  it("時間以現在為準：特報已經開始、還沒結束，半夜看也一樣；臺南市的結束時間不在今天，看得到最長的「到 M/D HH:mm」", () => {
    for (const now of [new Date("2026-11-02T05:20:00Z"), new Date("2026-11-02T15:50:00Z"), new Date("2026-11-02T16:10:00Z")]) {
      const response = warningResponse(undefined, now);
      const { warnings } = parseWarnings(response);
      const ends = [...(warnings?.values() ?? [])].flat().map((warning) => new Date(warning.end ?? 0));
      const starts = response.records.location.flatMap((location) => location.hazardConditions.hazards.map((hazard) => parseCwaTime(hazard.validTime.startTime)));

      expect(ends).toHaveLength(5);
      for (const end of ends) expect(end.getTime()).toBeGreaterThan(now.getTime());
      for (const start of starts) expect(new Date(start ?? "").getTime()).toBeLessThanOrEqual(now.getTime());
      for (const warning of warnings?.get("臺南市") ?? []) expect(taipeiDateKey(new Date(warning.end ?? 0))).not.toBe(taipeiDateKey(now));
    }
  });
});

describe("天氣頁的假回應有今天的細節", () => {
  it("F-D0047-091 每一段有體感溫度、相對濕度、風速與風向，白天的時段有紫外線：網站照真的解析看得到", async () => {
    const reply = await mockRequest(handle, `/api/v1/rest/datastore/F-D0047-091?Authorization=dev-cwa&LocationName=${encodeURIComponent("臺北市")}`);
    const days = parseCwaWeek(reply.data, "臺北市");

    expect(days.length).toBeGreaterThanOrEqual(7);
    for (const { details } of days) {
      expect(details.feelsHigh).not.toBeNull();
      expect(details.feelsLow).not.toBeNull();
      expect(details.humidity).not.toBeNull();
      expect(details.wind?.direction).toBeTruthy();
      expect(details.wind?.level).not.toBeNull();
    }
    // 晚上看時今天只剩晚上那一段 之後每天都有白天
    expect(days.slice(1).every(({ details }) => details.uv !== null)).toBe(true);
  });

  it("Open-Meteo 有體感、濕度、最大風速與主要風向、紫外線與日出日落", async () => {
    const reply = await mockRequest(handle, "/v1/forecast?latitude=35.6895&longitude=139.6917&timezone=Asia%2FTokyo&wind_speed_unit=ms");
    const days = parseOpenMeteoWeek(reply.data);

    expect(days).toHaveLength(7);
    for (const { details } of days) expect(Object.entries(details).filter(([, value]) => value === null)).toEqual([]);
  });
});
