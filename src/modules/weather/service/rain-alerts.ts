import "server-only";
import { eq } from "drizzle-orm";
import { claimKey, sendOnceEach } from "@/core/claim";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { activeOwnerOf } from "@/core/db/users";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { taipeiDateKey } from "@/core/time";
import { weatherSettings } from "../data/schema";
import { normalizeCounty, type County } from "../lib/counties";
import { periodLabel, upcomingPeriods, type ForecastPeriod } from "../lib/forecast";
import { rainOutlook } from "../lib/rain";
import { fetchForecasts, weatherKeys } from "./weather";

// 排程 weather:rain 台北早上 6 點多跑 會下雨就提醒開著通知的人帶傘
// 停用的帳號凍結不寄 每人每天只寄一次 認領記在 core_rate_limits 一天後刪

// service 不能 import 模組根目錄的 info 模組 id 寫在這裡
const MODULE_ID = "weather";
const CLAIM_SCOPE = "weather:rain";

/** 開著下雨通知 帳號也沒停用的人 照縣市分組 */
async function recipientsByCounty(): Promise<Map<County, string[]>> {
  const rows = await db()
    .select({ userId: weatherSettings.userId, county: weatherSettings.county })
    .from(weatherSettings)
    .innerJoin(coreUsers, activeOwnerOf(weatherSettings.userId))
    .where(eq(weatherSettings.rainAlert, true));
  const groups = new Map<County, string[]>();
  for (const row of rows) {
    const county = normalizeCounty(row.county);
    if (county) groups.set(county, [...(groups.get(county) ?? []), row.userId]);
  }
  return groups;
}

/** 縣市加上每一段的降雨機率 第一段寫完整 之後的只寫時段與百分比 讀不到的時段不寫 */
function rainBody(county: County, periods: readonly ForecastPeriod[], now: Date): string {
  const parts = periods.flatMap((period) => (period.rain === null ? [] : [{ label: periodLabel(new Date(period.start), now), rain: period.rain }]));
  return `${county} ${parts.map(({ label, rain }, i) => (i === 0 ? `${label}降雨機率 ${rain}%` : `${label} ${rain}%`)).join("、")}`;
}

type Tally = { sent: number; already: number; failed: number };

/** 摘要只有數字 不寫縣市與使用者 */
function summary({ sent, already, failed, missing }: Tally & { missing: number }): string {
  const parts = [
    sent > 0 && `寄出 ${sent} 則下雨提醒`,
    already > 0 && `${already} 人今天已經提醒過`,
    failed > 0 && `${failed} 則寄不出去`,
    missing > 0 && `${missing} 個縣市讀不到預報`,
  ].filter((part): part is string => typeof part === "string");
  return parts.length > 0 ? parts.join("，") : "今天沒有要提醒的人";
}

/** 看現在這一段與下一段 早上跑就是今天白天與今晚 降雨機率 50% 以上才寄 */
export async function sendRainAlerts(now = new Date()): Promise<string> {
  if (!weatherKeys().forecast) return "沒有設定氣象署的授權碼，略過";
  const groups = await recipientsByCounty();
  if (groups.size === 0) return "沒有開著下雨提醒的人";
  const forecasts = await fetchForecasts([...groups.keys()]);
  if (forecasts === null) return "讀不到天氣預報，今天略過";

  const today = taipeiDateKey(now);
  const totals = { sent: 0, already: 0, failed: 0, missing: 0 };
  for (const [county, userIds] of groups) {
    const forecast = forecasts.get(county);
    if (!forecast) {
      totals.missing++;
      continue;
    }
    const periods = upcomingPeriods(forecast, now).slice(0, 2);
    if (rainOutlook(periods)?.level !== "umbrella") continue;
    // 同一縣市的人一起寄 key 只存使用者 id 與日期的雜湊 出錯只放掉這次認領到的人 下一次排程再寄
    const result = await sendOnceEach(
      { scope: CLAIM_SCOPE, now, log: { module: MODULE_ID, what: "放掉下雨提醒的認領失敗" } },
      userIds,
      (userId) => claimKey(userId, today),
      (recipients) => notify({ recipients, module: MODULE_ID, kind: "rain", title: "記得帶傘", body: rainBody(county, periods, now), url: "/" }),
    );
    if (!result.ok) logError("weather", "下雨提醒寄不出去", result.error);
    totals.sent += result.sent.length;
    totals.already += result.already.length;
    totals.failed += result.failed.length;
  }
  return summary(totals);
}
