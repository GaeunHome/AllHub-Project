import type { County } from "../lib/counties";
import type { Forecast, ForecastPeriod } from "../lib/forecast";

// 天氣的測試共用的假資料 只有測試可以 import

/** 台北 10/19 的今天白天 今晚與明天白天 氣象署的時段是 6 點到 18 點與 18 點到隔天 6 點 */
const PERIODS = [
  { start: "2026-10-18T22:00:00.000Z", end: "2026-10-19T10:00:00.000Z" },
  { start: "2026-10-19T10:00:00.000Z", end: "2026-10-19T22:00:00.000Z" },
  { start: "2026-10-19T22:00:00.000Z", end: "2026-10-20T10:00:00.000Z" },
];

/** 整理好的預報 照時段的順序給降雨機率 其他欄位每一段都一樣 */
export const forecastWith = (rains: (number | null)[], overrides: Partial<ForecastPeriod> = {}, county: County = "臺北市"): Forecast => ({
  county,
  periods: rains.map((rain, i) => ({ ...PERIODS[i], description: "多雲", rain, minTemp: 22, maxTemp: 28, comfort: "舒適", ...overrides })),
});

/** 照真的回應的順序 */
const CWA_ELEMENTS = ["Wx", "PoP", "MinT", "CI", "MaxT"] as const;

/** 氣象署回應裡一個時段 要素的值照真的回應都是字串 沒給的要素不放 */
type CwaSlot = { start: string; end: string } & Partial<Record<(typeof CWA_ELEMENTS)[number], string>>;

/** 照氣象署 F-C0032-001 的格式寫一個縣市 每個要素各一串時段 */
export function cwaLocation(locationName: string, slots: CwaSlot[]) {
  return {
    locationName,
    weatherElement: CWA_ELEMENTS.filter((name) => slots.some((slot) => slot[name] !== undefined)).map((elementName) => ({
      elementName,
      time: slots.map((slot) => ({ startTime: slot.start, endTime: slot.end, parameter: { parameterName: slot[elementName] ?? "" } })),
    })),
  };
}

export const cwaResponse = (...locations: ReturnType<typeof cwaLocation>[]) => ({ success: "true", records: { datasetDescription: "三十六小時天氣預報", location: locations } });
