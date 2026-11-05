import "server-only";
import { claimKey, sendOnceEach } from "@/core/claim";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { reportService } from "@/core/status";
import { HOUR_MS, taipeiDateKey } from "@/core/time";
import { activeWarnings, warningEndText } from "../lib/warnings";
import { recipientsByCounty } from "./recipients";
import { ALL_COUNTIES_TIMEOUT_MS, fetchWarnings, weatherKeys } from "./weather";

// 排程 weather:warnings 大約每小時跑一次 特報隨時會發 寄給開著通知的人
// 停用的帳號凍結不寄 認領記在 core_rate_limits 一天後刪

// service 不能 import 模組根目錄的 info 模組 id 寫在這裡
const MODULE_ID = "weather";
const CLAIM_SCOPE = "weather:warning";

// 特報持續好幾天時每天早上提醒一次 不會在半夜 12 點多又寄一次
const ALERT_DAY_START_MS = 6 * HOUR_MS;

type Tally = { sent: number; already: number; failed: number };

/** 摘要只有數字 不寫縣市與使用者 */
function summary({ sent, already, failed }: Tally): string {
  const parts = [
    sent > 0 && `寄出 ${sent} 則天氣警特報通知`,
    already > 0 && `${already} 則今天已經提醒過`,
    failed > 0 && `${failed} 則寄不出去`,
  ].filter((part): part is string => typeof part === "string");
  return parts.length > 0 ? parts.join("，") : "目前沒有要通知的天氣警特報";
}

/** 同一縣市的每種特報每天寄一次 全台一次讀 讀不到就等下一輪 */
export async function sendWarningAlerts(now = new Date()): Promise<string> {
  if (!weatherKeys().forecast) return "沒有設定氣象署的授權碼，略過";
  const groups = await recipientsByCounty("warningAlert");
  if (groups.size === 0) return "沒有開著天氣警特報通知的人";
  const warnings = await fetchWarnings(null, undefined, ALL_COUNTIES_TIMEOUT_MS);
  await reportService("weather:warnings", warnings === null ? "讀不到天氣警特報" : null);
  if (warnings === null) return "讀不到天氣警特報，這一輪略過";

  const alertDay = taipeiDateKey(new Date(now.getTime() - ALERT_DAY_START_MS));
  const totals: Tally = { sent: 0, already: 0, failed: 0 };
  for (const [county, userIds] of groups) {
    // 通知照新到舊排 警報最後寄 最急的才會在最上面
    for (const { label, end } of activeWarnings(warnings.get(county) ?? [], now).toReversed()) {
      // 氣象署更新特報時開始時間可能變 放進 key 會重複寄 出錯只放掉這次認領到的人 下一輪再寄
      const result = await sendOnceEach(
        { scope: CLAIM_SCOPE, now, log: { module: MODULE_ID, what: "放掉天氣警特報通知的認領失敗" } },
        userIds,
        (userId) => claimKey(userId, county, label, alertDay),
        (recipients) => notify({ recipients, module: MODULE_ID, kind: "warning", title: `${county} ${label}`, body: end === null ? "" : `到 ${warningEndText(end)}`, url: "/" }),
      );
      if (!result.ok) logError("weather", "天氣警特報通知寄不出去", result.error);
      totals.sent += result.sent.length;
      totals.already += result.already.length;
      totals.failed += result.failed.length;
    }
  }
  return summary(totals);
}
