import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { sendOrRelease } from "@/core/claim";
import { db } from "@/core/db";
import { logError } from "@/core/errors";
import { fetchDailyNote } from "../lib/hoyolab";
import { endgameCheckDue } from "../lib/reminders";
import { formatTaipeiTime, staminaFullAt, type DailyNote, type HoyolabResult } from "../lib/responses";
import { alertThreshold, staminaAlertAction } from "../lib/stamina";
import { STARRAIL_HREF } from "../lib/urls";
import { starrailAccounts, type StarrailAccount } from "../data/schema";
import { cookieOf, isolate, listAccounts, setCookieInvalid, trackingAccountChanges, UNDECRYPTABLE, type AccountChanges, type Outcome } from "./accounts";
import { notifyOwner } from "./notices";
import { sendEndgameReminders, sendNoteReminders } from "./reminders";

/** 排程用的即時便箋 跟頁面不同 讀完就寫回 cookie 失效標記 */
export async function getDailyNote(account: StarrailAccount, changes?: AccountChanges): Promise<HoyolabResult<DailyNote>> {
  const cookie = await cookieOf(account, changes);
  if (cookie === null) return { ok: false, retcode: null, message: UNDECRYPTABLE, cookieInvalid: true };
  const result = await fetchDailyNote(cookie, account.uid, account.region);
  await setCookieInvalid(account.id, !result.ok && result.cookieInvalid, changes);
  return result;
}

/** 每小時一次 開拓力快滿 每日實訓 每週內容與終局挑戰的提醒都在這裡 */
export async function checkStaminaAll(now = new Date()): Promise<string> {
  const accounts = await listAccounts();
  const lines: string[] = [];

  await trackingAccountChanges(async (changes) => {
    for (const account of accounts) {
      const name = account.nickname ?? account.uid;
      const result = await isolate(account, () => checkStamina(account, now, changes));
      lines.push(`${name}：${result.ok ? result.message : `查詢失敗 — ${result.error}`}`);
    }
  });
  return lines.join("；") || "沒有連結的帳號";
}

async function checkStamina(account: StarrailAccount, now: Date, changes: AccountChanges): Promise<Outcome<{ message: string }>> {
  const note = await getDailyNote(account, changes);
  if (!note.ok) return { ok: false, error: note.message };

  const action = staminaAlertAction(note.data, account.staminaAlertThreshold, account.lastStaminaAlertAt !== null);
  const alerted = action === "alert" && (await alertStamina(account, note.data, now, changes));
  if (action === "reset") {
    await db().update(starrailAccounts).set({ lastStaminaAlertAt: null }).where(eq(starrailAccounts.id, account.id));
    changes.changed = true;
  }
  const reminded = account.gameReminders ? await sendReminders(account, note.data, now, changes) : [];
  return {
    ok: true,
    message: `${note.data.stamina}/${note.data.maxStamina}${alerted ? "（已通知）" : ""}${reminded.length > 0 ? `（提醒${reminded.join("、")}）` : ""}`,
  };
}

/**
 * 先用條件式 update 認領這一輪 同一小時重送的排程只有一個認領得到
 * 通知寫不進去就退回認領 下一次排程再通知
 */
async function alertStamina(account: StarrailAccount, note: DailyNote, now: Date, changes: AccountChanges): Promise<boolean> {
  const claimed = await db()
    .update(starrailAccounts)
    .set({ lastStaminaAlertAt: now })
    .where(and(eq(starrailAccounts.id, account.id), isNull(starrailAccounts.lastStaminaAlertAt)))
    .returning({ id: starrailAccounts.id });
  if (claimed.length === 0) return false;
  changes.changed = true;
  const fullAt = staminaFullAt(note, now);
  await sendOrRelease(
    () =>
      notifyOwner(account.userId, {
        kind: "stamina",
        title: `${account.nickname ?? account.uid} 的開拓力快滿了`,
        body: [`開拓力 ${note.stamina}/${note.maxStamina}（門檻 ${alertThreshold(note, account.staminaAlertThreshold)}）`, fullAt ? `預計 ${formatTaipeiTime(fullAt, now)} 回滿` : "已經滿了"].join("\n"),
        url: STARRAIL_HREF,
      }),
    () =>
      db()
        .update(starrailAccounts)
        .set({ lastStaminaAlertAt: null })
        .where(and(eq(starrailAccounts.id, account.id), eq(starrailAccounts.lastStaminaAlertAt, now))),
    { module: "starrail", what: "退回開拓力提醒的認領失敗" },
  );
  return true;
}

/** 提醒出錯不影響開拓力的結果 錯誤細節只進 log */
async function sendReminders(account: StarrailAccount, note: DailyNote, now: Date, changes: AccountChanges): Promise<string[]> {
  try {
    const sent = await sendNoteReminders(account, note, now);
    // 傍晚以後才解 cookie 查活動日曆 解不開會標記失效
    if (!endgameCheckDue(account.region, now)) return sent;
    const cookie = await cookieOf(account, changes);
    return cookie === null ? sent : [...sent, ...(await sendEndgameReminders(account, cookie, now))];
  } catch (error) {
    logError("starrail", "發送提醒失敗", error, account.uid);
    return [];
  }
}
