import "server-only";
import { and, desc, eq, exists, isNotNull, lt, or, sql } from "drizzle-orm";
import { claimKey, sendOnce } from "@/core/claim";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { activeOwnerOf } from "@/core/db/users";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { taipeiDateKey } from "@/core/time";
import { remindersItems } from "../data/schema";
import { countdownText, daysUntil, formatDate } from "../lib/countdown";

// 排程 reminders:daily 台北 7 點多與 12 點多各跑一次 先寄今天要寄的 再刪日期過了的
// 中午那一次補寄早上寄不出去的 停用的帳號凍結 不寄也不刪 恢復後的下一次排程才處理

// service 不能 import 模組根目錄的 info 模組 id 寫在這裡
const MODULE_ID = "reminders";
const CLAIM_SCOPE = "reminders:due";

type DueItem = { id: number; userId: string; title: string; date: string };

/**
 * 擁有者沒停用 今天是當天或提前那天的項目 提前的日子過了就只剩當天
 * 通知新的在上面 首頁未讀只顯示最新幾則 所以日子近的排後面 最後寫入
 */
async function dueItems(today: string): Promise<DueItem[]> {
  const isDay = eq(remindersItems.date, today);
  const isAdvanceDay = sql`${remindersItems.date} - ${remindersItems.notifyDaysBefore} = ${today}::date`;
  return db()
    .select({ id: remindersItems.id, userId: remindersItems.userId, title: remindersItems.title, date: remindersItems.date })
    .from(remindersItems)
    .innerJoin(coreUsers, activeOwnerOf(remindersItems.userId))
    .where(and(isNotNull(remindersItems.notifyDaysBefore), or(isDay, isAdvanceDay)))
    .orderBy(desc(remindersItems.date), desc(remindersItems.id));
}

/** 同一天重跑不重複寄 回傳這次有沒有寄 寄不出去時丟出錯誤 */
function sendDue(item: DueItem, today: string, now: Date): Promise<boolean> {
  return sendOnce({ scope: CLAIM_SCOPE, key: claimKey(item.id, today), now, log: { module: MODULE_ID, what: "放掉提醒的認領失敗" } }, () =>
    notify({
      recipients: [item.userId],
      module: MODULE_ID,
      kind: "due",
      title: `${countdownText(daysUntil(item.date, now))}：${item.title}`,
      body: formatDate(item.date, today),
      url: "/",
    }),
  );
}

async function deleteExpiredItems(today: string): Promise<number> {
  const owner = db().select({ id: coreUsers.id }).from(coreUsers).where(activeOwnerOf(remindersItems.userId));
  const deleted = await db()
    .delete(remindersItems)
    .where(and(lt(remindersItems.date, today), exists(owner)))
    .returning({ id: remindersItems.id });
  return deleted.length;
}

type Tally = { sent: number; already: number; failed: number; deleted: number };

/** 摘要只有數字 不寫標題與使用者 */
function summary({ sent, already, failed, deleted }: Tally): string {
  const parts = [
    sent > 0 && `寄出 ${sent} 則提醒`,
    already > 0 && `${already} 則今天已經寄過`,
    failed > 0 && `${failed} 則寄不出去`,
    deleted > 0 && `刪除 ${deleted} 個過期的提醒`,
  ].filter((part): part is string => typeof part === "string");
  return parts.length > 0 ? parts.join("，") : "今天沒有要寄或要刪的提醒";
}

export async function sendDailyReminders(now = new Date()): Promise<string> {
  const today = taipeiDateKey(now);
  const tally = { sent: 0, already: 0, failed: 0 };
  for (const item of await dueItems(today)) {
    try {
      if (await sendDue(item, today, now)) tally.sent++;
      else tally.already++;
    } catch (error) {
      // 一筆出錯不能擋住其他筆 sendOnce 已經放掉認領 早上寄不出去的中午那一次再寄
      tally.failed++;
      logError(MODULE_ID, "提醒寄不出去", error);
    }
  }
  return summary({ ...tally, deleted: await deleteExpiredItems(today) });
}
