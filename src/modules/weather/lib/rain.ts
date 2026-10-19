import type { ForecastPeriod } from "./forecast";

/** 降雨機率到這裡就提醒帶傘 早上的通知也用這個門檻 */
export const UMBRELLA_PERCENT = 50;
/** 到這裡只在卡片上建議帶把折傘 不發通知 */
export const MAYBE_PERCENT = 30;

export type RainLevel = "umbrella" | "maybe" | "dry";
/** peak 是降雨機率最高的時段 一樣高時取比較早的 */
export type RainOutlook = { level: RainLevel; peak: ForecastPeriod & { rain: number } };

/** periods 傳卡片顯示的那兩段 現在這一段與下一段 降雨機率都讀不到時回 null */
export function rainOutlook(periods: readonly ForecastPeriod[]): RainOutlook | null {
  const peak = periods
    .filter((period): period is ForecastPeriod & { rain: number } => period.rain !== null)
    .reduce<RainOutlook["peak"] | null>((best, period) => (best === null || period.rain > best.rain || (period.rain === best.rain && period.start < best.start) ? period : best), null);
  if (peak === null) return null;
  return { level: peak.rain >= UMBRELLA_PERCENT ? "umbrella" : peak.rain >= MAYBE_PERCENT ? "maybe" : "dry", peak };
}
