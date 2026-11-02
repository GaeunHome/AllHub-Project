import { asRecord, createMissing, text } from "@/core/json";
import { formatTaipeiHourMinute, formatTaipeiMonthDay, taipeiDayOffset } from "@/core/time";
import { normalizeCounty, type County } from "./counties";
import { parseCwaTime } from "./forecast";

// 氣象署 W-C0033-001 各別縣市目前的天氣警特報
// 回應是 records.location[].hazardConditions.hazards[] 真實的回應還沒看過 路徑來自公開專案的程式

/** label 例如大雨特報 severe 是警報 end 是 ISO 字串 快取裡放字串才不怕序列化 */
export type Warning = { label: string; severe: boolean; end: string | null };

type Missing = ReturnType<typeof createMissing>;

function parseHazard(value: unknown, missing: Missing): Warning | null {
  const hazard = asRecord(value);
  const info = asRecord(hazard?.info);
  const phenomena = missing.need(text(info?.phenomena), "hazards[].info.phenomena")?.trim();
  if (!phenomena) return null;
  const significance = missing.need(text(info?.significance), "hazards[].info.significance")?.trim() ?? "";
  const end = missing.need(parseCwaTime(asRecord(hazard?.validTime)?.endTime), "hazards[].validTime.endTime");
  // 有專案的資料把現象寫成陸上強風特報 再接一次就重複了
  return { label: phenomena.endsWith(significance) ? phenomena : `${phenomena}${significance}`, severe: significance === "警報", end };
}

/** 讀不到結束時間的當成最晚 不能因為欄位讀不到就藏起還在生效的特報 */
const endsLater = (warning: Warning, other: Warning) => other.end !== null && (warning.end === null || warning.end > other.end);

/** 同一個 label 留最晚結束的 留先出現的話過期的會連還在生效的一起藏掉 警報排在前面 其他照回應的順序 */
function countyWarnings(hazards: unknown[], missing: Missing): Warning[] {
  const byLabel = new Map<string, Warning>();
  for (const hazard of hazards) {
    const warning = parseHazard(hazard, missing);
    if (!warning) continue;
    const kept = byLabel.get(warning.label);
    if (!kept || endsLater(warning, kept)) byLabel.set(warning.label, warning);
  }
  return [...byLabel.values()].sort((a, b) => Number(b.severe) - Number(a.severe));
}

/** 沒有 hazards 是目前沒有特報 有這個欄位卻不是陣列要留線索 真實的回應還沒看過 */
function hazardsOf(location: Record<string, unknown> | null, missing: Missing): unknown[] {
  const conditions = asRecord(location?.hazardConditions);
  return conditions && "hazards" in conditions ? missing.list(conditions, "hazards", "records.location[].hazardConditions.hazards") : [];
}

/**
 * 每個縣市的特報 沒有 hazardConditions 或 hazards 是空的表示目前沒有特報
 * 只有 records.location 不是陣列才算讀不到 missing 只記欄位路徑 不記回應原文
 */
export function parseWarnings(json: unknown): { warnings: Map<County, Warning[]> | null; missing: string[] } {
  const locations = asRecord(asRecord(json)?.records)?.location;
  if (!Array.isArray(locations)) return { warnings: null, missing: ["records.location"] };

  const missing = createMissing();
  const warnings = new Map<County, Warning[]>();
  for (const value of locations) {
    const location = asRecord(value);
    const name = text(location?.locationName);
    const county = missing.need(name === null ? null : normalizeCounty(name), "records.location[].locationName");
    if (county !== null) warnings.set(county, countyWarnings(hazardsOf(location, missing), missing));
  }
  return { warnings, missing: missing.sorted() };
}

/** 氣象署還沒撤掉但結束時間已過的不算 讀不到結束時間的留著 */
export const activeWarnings = (warnings: readonly Warning[], now: Date): Warning[] => warnings.filter(({ end }) => end === null || new Date(end) > now);

/** 帶 now 時今天只寫時間 通知會留在清單裡好幾天 不帶 now 一律寫月日 */
export function warningEndText(end: string, now?: Date): string {
  const date = new Date(end);
  const time = formatTaipeiHourMinute(date);
  return now && taipeiDayOffset(date, now) === 0 ? time : `${formatTaipeiMonthDay(date)} ${time}`;
}
