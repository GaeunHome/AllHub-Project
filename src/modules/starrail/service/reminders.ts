import "server-only";
import { notify } from "@/core/notify";
import { challengeLabel } from "../lib/calendar";
import { fetchActCalendar } from "../lib/hoyolab";
import { dailyTrainingReminder, endgameCheckDue, endgamePeriod, endgameReminders, weeklyReminder } from "../lib/reminders";
import { formatTaipeiTime, type DailyNote } from "../lib/responses";
import type { StarrailAccount } from "../data/schema";
import { notifyOnce } from "./notify-once";

// service 不能 import 模組根目錄的 info.ts 模組 id 寫在這裡
const MODULE_ID = "starrail";

type OwnedAccount = StarrailAccount & { userId: string };

// 同一個帳號同一期只提醒一次 認領的紀錄一天後就刪 所以每種提醒的時段都短於一天

const nameOf = (account: OwnedAccount) => account.nickname ?? account.uid;
const accountUrl = (account: OwnedAccount) => `/starrail?account=${account.id}`;

/** 每日實訓與每週內容 便箋裡就有 回傳這次發了哪幾種 */
export async function sendNoteReminders(account: OwnedAccount, note: DailyNote, now: Date): Promise<string[]> {
  const sent: string[] = [];
  const daily = dailyTrainingReminder(note, account.region, now);
  const dailySent =
    daily &&
    (await notifyOnce("daily", account.id, daily.period, now, () =>
      notify({
        recipients: [account.userId],
        module: MODULE_ID,
        kind: "daily",
        title: `${nameOf(account)} 的每日實訓還沒完成`,
        body: `每日實訓 ${daily.score}/${daily.max}，${formatTaipeiTime(daily.resetAt, now)} 重置`,
        url: accountUrl(account),
      }),
    ));
  if (dailySent) sent.push("每日實訓");
  const weekly = weeklyReminder(note, account.region, now);
  if (weekly) {
    const lines = [
      weekly.rogue && `模擬宇宙積分 ${weekly.rogue.score}/${weekly.rogue.max}`,
      weekly.cocoon && `歷戰餘響還有 ${weekly.cocoon.remaining}${weekly.cocoon.limit === null ? "" : `/${weekly.cocoon.limit}`} 次`,
      `${formatTaipeiTime(weekly.resetAt, now)} 換週`,
    ];
    const weeklySent = await notifyOnce("weekly", account.id, weekly.period, now, () =>
      notify({
        recipients: [account.userId],
        module: MODULE_ID,
        kind: "weekly",
        title: `${nameOf(account)} 的每週內容還沒做完`,
        body: lines.filter(Boolean).join("\n"),
        url: accountUrl(account),
      }),
    );
    if (weeklySent) sent.push("每週內容");
  }
  return sent;
}

/** 傍晚才查活動日曆 還剩一到兩天又沒拿滿的終局挑戰各發一則 */
export async function sendEndgameReminders(account: OwnedAccount, cookie: string, now: Date): Promise<string[]> {
  if (!endgameCheckDue(account.region, now)) return [];
  const result = await fetchActCalendar(cookie, account.uid, account.region);
  if (!result.ok) {
    // 回應原文可能帶有帳號資料 只記 retcode
    console.error("[starrail] 提醒讀取活動日曆失敗", account.id, `retcode ${result.retcode}`);
    return [];
  }
  const sent: string[] = [];
  for (const challenge of endgameReminders(result.data.calendar.challenges, now)) {
    const label = challengeLabel(challenge.kind) ?? challenge.name ?? "終局挑戰";
    const name = challenge.name && challenge.name !== label ? `「${challenge.name}」` : "";
    const done = await notifyOnce("endgame", account.id, endgamePeriod(challenge), now, () =>
      notify({
        recipients: [account.userId],
        module: MODULE_ID,
        kind: "endgame",
        title: `${nameOf(account)} 的${label}快結束了`,
        body: `${label}${name}進度 ${challenge.current}/${challenge.total}，${formatTaipeiTime(new Date(challenge.endsAt), now)} 結束`,
        url: accountUrl(account),
      }),
    );
    if (done) sent.push(label);
  }
  return sent;
}
