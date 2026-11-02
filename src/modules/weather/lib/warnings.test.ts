import { describe, expect, it } from "vitest";
import { cwaWarningLocation, cwaWarningResponse } from "../dev/fixtures";
import { activeWarnings, parseWarnings } from "./warnings";

// 照氣象署 W-C0033-001 官方欄位表與公開專案確認的路徑手寫 時間是台北時間
const SAMPLE = {
  success: "true",
  records: {
    location: [
      {
        locationName: "臺北市",
        geocode: "63",
        hazardConditions: {
          hazards: [{ info: { language: "zh-TW", phenomena: "大雨", significance: "特報" }, validTime: { startTime: "2026-11-02 08:00:00", endTime: "2026-11-02 20:00:00" } }],
        },
      },
      { locationName: "高雄市", geocode: "64", hazardConditions: { hazards: [] } },
    ],
  },
};

const END = "2026-11-02 20:00:00";
const parsed = (...hazards: Parameters<typeof cwaWarningLocation>[1]) => parseWarnings(cwaWarningResponse(cwaWarningLocation("臺北市", hazards)));
const warningsOf = (...hazards: Parameters<typeof cwaWarningLocation>[1]) => parsed(...hazards).warnings?.get("臺北市");

describe("還在生效的特報", () => {
  const NOW = new Date("2026-11-02T02:00:00.000Z");
  const warning = (end: string | null) => ({ label: "大雨特報", severe: false, end });

  it("氣象署還沒撤掉、結束時間已過的不算：早上 10 點不該再看到到 08:00 的特報", () => {
    expect(activeWarnings([warning("2026-11-02T00:00:00.000Z")], NOW)).toEqual([]);
  });

  it("剛好到結束時間就不算，還沒到的留著", () => {
    expect(activeWarnings([warning(NOW.toISOString())], NOW)).toEqual([]);
    expect(activeWarnings([warning("2026-11-02T02:00:01.000Z")], NOW)).toHaveLength(1);
  });

  it("讀不到結束時間時留著：不能因為欄位讀不到就藏起還在生效的特報", () => {
    expect(activeWarnings([warning(null)], NOW)).toHaveLength(1);
  });
});

describe("氣象署的天氣警特報（W-C0033-001）", () => {
  it("照回應的路徑讀出每個縣市的特報：現象加等級是標籤、特報不算嚴重、結束時間當台北時間；沒有特報的縣市是空陣列", () => {
    const { warnings, missing } = parseWarnings(SAMPLE);

    expect(missing).toEqual([]);
    expect(warnings?.get("臺北市")).toEqual([{ label: "大雨特報", severe: false, end: "2026-11-02T12:00:00.000Z" }]);
    expect(warnings?.get("高雄市")).toEqual([]);
  });

  it("現象已經以等級結尾時不重複：有專案的資料把現象寫成「陸上強風特報」", () => {
    expect(warningsOf({ phenomena: "陸上強風特報", significance: "特報", end: END })?.map((warning) => warning.label)).toEqual(["陸上強風特報"]);
  });

  it("等級是「警報」才算嚴重：颱風警報是，大雨特報不是", () => {
    expect(warningsOf({ phenomena: "海上陸上颱風", significance: "警報", end: END }, { phenomena: "大雨", significance: "特報", end: END })?.map(({ label, severe }) => [label, severe])).toEqual([
      ["海上陸上颱風警報", true],
      ["大雨特報", false],
    ]);
  });

  it("結束時間舊的「2026-11-02 20:00:00」與新的 ISO 加 +08:00 都當台北時間", () => {
    expect(warningsOf({ phenomena: "大雨", significance: "特報", end: "2026-11-02 20:00:00" })?.[0].end).toBe("2026-11-02T12:00:00.000Z");
    expect(warningsOf({ phenomena: "大雨", significance: "特報", end: "2026-11-02T20:00:00+08:00" })?.[0].end).toBe("2026-11-02T12:00:00.000Z");
  });

  it("讀不到結束時間時是 null、特報照樣留著，並記下欄位路徑", () => {
    for (const end of [undefined, "不是時間"]) {
      const { warnings, missing } = parsed({ phenomena: "大雨", significance: "特報", end });

      expect(warnings?.get("臺北市")).toEqual([{ label: "大雨特報", severe: false, end: null }]);
      expect(missing).toEqual(["hazards[].validTime.endTime"]);
    }
  });

  it("沒有現象的略過並記下欄位，同一個縣市其他特報照常", () => {
    const { warnings, missing } = parsed({ significance: "特報", end: END }, { phenomena: "  ", significance: "特報", end: END }, { phenomena: "濃霧", significance: "特報", end: END });

    expect(warnings?.get("臺北市")?.map((warning) => warning.label)).toEqual(["濃霧特報"]);
    expect(missing).toEqual(["hazards[].info.phenomena"]);
  });

  it("沒有等級時只用現象當標籤，不算嚴重，並記下欄位", () => {
    const { warnings, missing } = parsed({ phenomena: "大雨", end: END });

    expect(warnings?.get("臺北市")).toEqual([{ label: "大雨", severe: false, end: "2026-11-02T12:00:00.000Z" }]);
    expect(missing).toEqual(["hazards[].info.significance"]);
  });

  it("同一個標籤只留一筆（留最晚結束的，位置照第一次出現）；警報排在特報前面，其他照回應的順序", () => {
    const labels = warningsOf(
      { phenomena: "濃霧", significance: "特報", end: "2026-11-02 18:00:00" },
      { phenomena: "大雨", significance: "特報", end: END },
      { phenomena: "海上颱風", significance: "警報", end: END },
      { phenomena: "濃霧", significance: "特報", end: "2026-11-03 18:00:00" },
      { phenomena: "陸上颱風", significance: "警報", end: END },
      { phenomena: "陸上強風", significance: "特報", end: END },
    );

    expect(labels?.map((warning) => warning.label)).toEqual(["海上颱風警報", "陸上颱風警報", "濃霧特報", "大雨特報", "陸上強風特報"]);
    expect(labels?.[2].end).toBe("2026-11-03T10:00:00.000Z");
  });

  it("同一個標籤比較晚結束的先出現時也留它：不看回應的順序", () => {
    const foggy = warningsOf({ phenomena: "濃霧", significance: "特報", end: "2026-11-03 18:00:00" }, { phenomena: "濃霧", significance: "特報", end: "2026-11-02 18:00:00" });

    expect(foggy).toEqual([{ label: "濃霧特報", severe: false, end: "2026-11-03T10:00:00.000Z" }]);
  });

  it("同一個標籤有一筆讀不到結束時間時留那一筆：不知道幾點結束就當成最晚，不管它排在前面還是後面", () => {
    const withEnd = { phenomena: "濃霧", significance: "特報", end: END };
    const noEnd = { phenomena: "濃霧", significance: "特報" };

    expect(warningsOf(noEnd, withEnd)).toEqual([{ label: "濃霧特報", severe: false, end: null }]);
    expect(warningsOf(withEnd, noEnd)).toEqual([{ label: "濃霧特報", severe: false, end: null }]);
  });

  it("兩筆濃霧特報 08:00 與 20:00 結束、現在 10:00：20:00 那筆還在生效，不能跟著 08:00 那筆一起藏掉", () => {
    const foggy = warningsOf({ phenomena: "濃霧", significance: "特報", end: "2026-11-02 08:00:00" }, { phenomena: "濃霧", significance: "特報", end: "2026-11-02 20:00:00" });

    expect(activeWarnings(foggy ?? [], new Date("2026-11-02T02:00:00.000Z"))).toEqual([{ label: "濃霧特報", severe: false, end: "2026-11-02T12:00:00.000Z" }]);
  });

  it("縣市名稱寫「台」也對得上；不是 22 個縣市的略過並記下欄位（只記路徑，不記值）", () => {
    const { warnings, missing } = parseWarnings(cwaWarningResponse(cwaWarningLocation("台中市", [{ phenomena: "大雨", significance: "特報", end: END }]), cwaWarningLocation("臺灣海峽", [{ phenomena: "海上強風", significance: "特報", end: END }]), { hazardConditions: { hazards: [] } }));

    expect([...(warnings?.keys() ?? [])]).toEqual(["臺中市"]);
    expect(missing).toEqual(["records.location[].locationName"]);
  });

  it("hazards 是空陣列或沒有 hazardConditions 是這個縣市目前沒有特報，不是讀不到，也不算缺欄位", () => {
    const { warnings, missing } = parseWarnings(cwaWarningResponse({ locationName: "臺北市", hazardConditions: { hazards: [] } }, { locationName: "花蓮縣" }, { locationName: "臺東縣", hazardConditions: null }));

    expect(warnings).toEqual(
      new Map([
        ["臺北市", []],
        ["花蓮縣", []],
        ["臺東縣", []],
      ]),
    );
    expect(missing).toEqual([]);
  });

  it.each([["物件", { phenomena: "大雨" }], ["字串", "大雨特報"], ["數字", 0], ["null", null]])("hazards 存在但不是陣列（%s）：當成沒有特報，但記下欄位路徑留線索，真實的回應還沒看過", (_, hazards) => {
    const { warnings, missing } = parseWarnings(cwaWarningResponse({ locationName: "臺北市", hazardConditions: { hazards } }));

    expect(warnings).toEqual(new Map([["臺北市", []]]));
    expect(missing).toEqual(["records.location[].hazardConditions.hazards"]);
  });

  it("hazardConditions 裡沒有 hazards：跟沒有 hazardConditions 一樣是目前沒有特報，不算缺欄位", () => {
    expect(parseWarnings(cwaWarningResponse({ locationName: "臺北市", hazardConditions: {} }))).toEqual({ warnings: new Map([["臺北市", []]]), missing: [] });
  });

  it("一個縣市的 hazards 格式不對不影響其他縣市", () => {
    const { warnings, missing } = parseWarnings(cwaWarningResponse({ locationName: "花蓮縣", hazardConditions: { hazards: "壞掉" } }, cwaWarningLocation("臺北市", [{ phenomena: "大雨", significance: "特報", end: END }])));

    expect(warnings?.get("花蓮縣")).toEqual([]);
    expect(warnings?.get("臺北市")).toHaveLength(1);
    expect(missing).toEqual(["records.location[].hazardConditions.hazards"]);
  });

  it("records.location 是空陣列：讀到了，全台都沒有特報", () => {
    expect(parseWarnings(cwaWarningResponse())).toEqual({ warnings: new Map(), missing: [] });
  });

  it("records.location 不是陣列才是讀不到：回 null 並記下欄位", () => {
    for (const json of [{ success: "false" }, { records: {} }, { records: { location: {} } }, "壞掉的回應", null]) {
      expect(parseWarnings(json)).toEqual({ warnings: null, missing: ["records.location"] });
    }
  });
});
