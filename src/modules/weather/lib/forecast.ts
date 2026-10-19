import { asArray, asRecord, numberOf } from "@/core/json";
import { formatTaipeiHourMinute, formatTaipeiMonthDay, taipeiDayOffset } from "@/core/time";
import { normalizeCounty, type County } from "./counties";

// 氣象署 F-C0032-001 今明 36 小時天氣預報 每個縣市三個 12 小時的時段
// 回應是 records.location[].weatherElement[].time[] 每個要素各一串時段

/** start 與 end 是 ISO 字串 快取裡放字串才不怕序列化 rain 是降雨機率的百分比 */
export type ForecastPeriod = { start: string; end: string; description: string; rain: number | null; minTemp: number | null; maxTemp: number | null; comfort: string | null };

export type Forecast = { county: County; periods: ForecastPeriod[] };

type Parameter = { parameterName?: unknown };
type TimeSlot = { startTime?: unknown; endTime?: unknown; parameter?: Parameter };
type Element = { elementName?: unknown; time?: unknown };

const ELEMENTS = ["Wx", "PoP", "MinT", "MaxT", "CI"] as const;

const record = (value: unknown): Record<string, unknown> => asRecord(value) ?? {};

/** 舊的回應是 2026-10-16 18:00:00 新的是 2026-10-16T18:00:00+08:00 都是台北時間 */
export function parseCwaTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value.trim()) ? `${value.trim().replace(" ", "T")}+08:00` : value.trim();
  const time = new Date(text);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

// 氣象署的數值一律寫成字串
const cwaNumber = (value: unknown) => numberOf(value, { stringsOnly: true });

/** missing 是讀不到的欄位名稱 只記名稱 不記回應原文 */
export function parseForecast(json: unknown, county: County): { forecast: Forecast | null; missing: string[] } {
  const locations = asArray(record(record(json).records).location).map(record);
  const location = locations.find((item) => typeof item.locationName === "string" && normalizeCounty(item.locationName) === county);
  if (!location) return { forecast: null, missing: ["records.location"] };

  const elements = new Map(asArray(location.weatherElement).map((item) => [record(item).elementName, asArray(record(item as Element).time).map((slot) => record(slot) as TimeSlot)]));
  const missing = ELEMENTS.filter((name) => !elements.has(name));
  // 其他要素照開始時間對到天氣現象的時段
  const valueAt = (name: (typeof ELEMENTS)[number], start: string) => elements.get(name)?.find((slot) => parseCwaTime(slot.startTime) === start)?.parameter?.parameterName;

  const periods = (elements.get("Wx") ?? []).flatMap((slot): ForecastPeriod[] => {
    const start = parseCwaTime(slot.startTime);
    const end = parseCwaTime(slot.endTime);
    const description = slot.parameter?.parameterName;
    if (start === null || end === null || typeof description !== "string") return [];
    const comfort = valueAt("CI", start);
    return [{ start, end, description, rain: cwaNumber(valueAt("PoP", start)), minTemp: cwaNumber(valueAt("MinT", start)), maxTemp: cwaNumber(valueAt("MaxT", start)), comfort: typeof comfort === "string" ? comfort : null }];
  });
  periods.sort((a, b) => a.start.localeCompare(b.start));
  return { forecast: periods.length > 0 ? { county, periods } : null, missing: periods.length > 0 ? missing : [...new Set([...missing, "Wx.time"])] };
}

/** 還沒結束的時段 第一個是現在這一段 */
export function upcomingPeriods(forecast: Forecast, now: Date): ForecastPeriod[] {
  return forecast.periods.filter((period) => new Date(period.end) > now);
}

/** 時段從台北的幾點開始 */
function dayPart(start: Date): "凌晨" | "白天" | "下午" | "晚上" {
  const hour = Number(formatTaipeiHourMinute(start).slice(0, 2));
  return hour < 6 ? "凌晨" : hour < 12 ? "白天" : hour < 18 ? "下午" : "晚上";
}

/** 晚上與凌晨開始的時段 晴天與多雲的圖示換成月亮 */
export function isNight(start: Date): boolean {
  const part = dayPart(start);
  return part === "晚上" || part === "凌晨";
}

/** 例如今天白天 今晚 明天下午 更遠的寫日期 */
export function periodLabel(start: Date, now: Date): string {
  const part = dayPart(start);
  const offset = taipeiDayOffset(start, now);
  // 半夜看前一天 18 點開始的時段 那個晚上還沒過完 還是今晚
  if (offset === -1 && part === "晚上") return "今晚";
  if (offset === 0) return part === "晚上" ? "今晚" : `今天${part}`;
  if (offset === 1) return part === "晚上" ? "明晚" : `明天${part}`;
  return `${formatTaipeiMonthDay(start)} ${part}`;
}
