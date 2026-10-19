import "server-only";
import { challengeLabel } from "../lib/calendar";
import { fetchActCalendar } from "../lib/hoyolab";
import { dailyTrainingReminder, endgamePeriod, endgameReminders, weeklyReminder } from "../lib/reminders";
import { formatTaipeiTime, type DailyNote } from "../lib/responses";
import { accountHref } from "../lib/urls";
import type { StarrailAccount } from "../data/schema";
import { notifyOnce } from "./notices";

const nameOf = (account: StarrailAccount) => account.nickname ?? account.uid;

/** 每日實訓與每週內容 便箋裡就有 回傳這次發了哪幾種 */
export async function sendNoteReminders(account: StarrailAccount, note: DailyNote, now: Date): Promise<string[]> {
  const sent: string[] = [];
  const daily = dailyTrainingReminder(note, account.region, now);
  const dailySent =
    daily &&
    (await notifyOnce(account, daily.period, now, {
      kind: "daily",
      title: `${nameOf(account)} 的每日實訓還沒完成`,
      body: `每日實訓 ${daily.score}/${daily.max}，${formatTaipeiTime(daily.resetAt, now)} 重置`,
      url: accountHref(account.id),
    }));
  if (dailySent) sent.push("每日實訓");
  const weekly = weeklyReminder(note, account.region, now);
  if (weekly) {
    const lines = [
      weekly.rogue && `模擬宇宙積分 ${weekly.rogue.score}/${weekly.rogue.max}`,
      weekly.cocoon && `歷戰餘響還有 ${weekly.cocoon.remaining}${weekly.cocoon.limit === null ? "" : `/${weekly.cocoon.limit}`} 次`,
      `${formatTaipeiTime(weekly.resetAt, now)} 換週`,
    ];
    const weeklySent = await notifyOnce(account, weekly.period, now, {
      kind: "weekly",
      title: `${nameOf(account)} 的每週內容還沒做完`,
      body: lines.filter(Boolean).join("\n"),
      url: accountHref(account.id),
    });
    if (weeklySent) sent.push("每週內容");
  }
  return sent;
}

/** 傍晚以後才呼叫 由呼叫端先用 endgameCheckDue 判斷 還剩一到兩天又沒拿滿的終局挑戰各發一則 */
export async function sendEndgameReminders(account: StarrailAccount, cookie: string, now: Date): Promise<string[]> {
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
    const done = await notifyOnce(account, endgamePeriod(challenge), now, {
      kind: "endgame",
      title: `${nameOf(account)} 的${label}快結束了`,
      body: `${label}${name}進度 ${challenge.current}/${challenge.total}，${formatTaipeiTime(new Date(challenge.endsAt), now)} 結束`,
      url: accountHref(account.id),
    });
    if (done) sent.push(label);
  }
  return sent;
}
