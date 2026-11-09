import type { County } from "../lib/counties";
import type { DayDetails } from "../lib/details";
import type { Forecast, ForecastPeriod } from "../lib/forecast";
import type { HourPoint, WeekDay } from "../lib/weekly";

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

/** 氣象署回應裡一個特報 沒給的欄位不放 */
type CwaHazard = { phenomena?: string; significance?: string; start?: string; end?: string };

/** 照氣象署 W-C0033-001 的格式寫一個縣市 */
export const cwaWarningLocation = (locationName: string, hazards: CwaHazard[]) => ({
  locationName,
  geocode: "63",
  hazardConditions: {
    hazards: hazards.map(({ phenomena, significance, start, end }) => ({ info: { language: "zh-TW", phenomena, significance }, validTime: { startTime: start, endTime: end } })),
  },
});

/** location 不一定照 cwaWarningLocation 寫 測試也要餵缺欄位的回應 */
export const cwaWarningResponse = (...locations: unknown[]) => ({ success: "true", records: { location: locations } });

/** 回應裡沒有任何細節的那一天 */
export const NO_DETAILS: DayDetails = { feelsHigh: null, feelsLow: null, humidity: null, dewPoint: null, comfort: null, wind: null, uv: null, sunrise: null, sunset: null };

/** 每小時的一格 沒給的欄位讀不到 */
export const hourPoint = (time: string, overrides: Partial<HourPoint> = {}): HourPoint => ({ time, temperature: null, rain: null, weather: null, feels: null, humidity: null, uv: null, ...overrides });

/** 一週預報的一天 沒給的欄位是晴天 25 到 18 度 */
export const weekDay = (date: string, overrides: Partial<WeekDay> = {}): WeekDay => ({ date, weather: "晴", high: 25, low: 18, rain: 10, details: NO_DETAILS, ...overrides });
