import "server-only";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { decryptSecret, encryptSecret, needsReencrypt } from "@/core/crypto";
import { db } from "@/core/db";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { RETENTION_DAYS, retentionCutoff } from "@/core/retention";
import { parseHoyolabCookie } from "../lib/cookie";
import { fetchCheckinInfo, fetchDailyNote, fetchGameRoles, signIn } from "../lib/hoyolab";
import { formatTaipeiTime, retcodeOf, staminaFullAt, type DailyNote, type HoyolabResult } from "../lib/responses";
import { starrailAccounts, starrailCheckinLogs, type StarrailAccount } from "../data/schema";
import { alertThreshold, staminaAlertAction } from "../lib/stamina";
import { starrailTags } from "./cache-tags";

/** already：今天已簽到過（排程不為這種結果發通知） */
export type ActionResult = { ok: true; message: string; already?: boolean } | { ok: false; error: string };

const UNDECRYPTABLE = "cookie 無法解密，請重新連結（換過 ENCRYPTION_KEY 的話，把舊金鑰放進 ENCRYPTION_KEY_PREVIOUS 即可恢復）";
// service 不能 import 模組根目錄的 info.ts，模組 id 寫在這裡（與 info.ts 的 id 相同）
const MODULE_ID = "starrail";
const CHECKIN_URL = "https://act.hoyolab.com/bbs/event/signin/hkrpg/index.html?act_id=e202303301540311";

/** 解密失敗（例如換了 ENCRYPTION_KEY）時回 null 並標記失效，讓頁面仍能移除或重新連結 */
async function cookieOf(account: StarrailAccount): Promise<string | null> {
  try {
    return decryptSecret(account.cookieEncrypted);
  } catch {
    await setCookieInvalid(account.id, true);
    return null;
  }
}

async function listAccounts(): Promise<StarrailAccount[]> {
  return db().select().from(starrailAccounts).orderBy(starrailAccounts.id);
}

/** 頁面顯示用的欄位：不含 cookie（連密文也不讀出來），可以放進快取 */
export type StarrailAccountView = Pick<StarrailAccount, "id" | "uid" | "nickname" | "level" | "staminaAlertThreshold" | "cookieInvalid">;

export async function listAccountViews(): Promise<StarrailAccountView[]> {
  return db()
    .select({
      id: starrailAccounts.id,
      uid: starrailAccounts.uid,
      nickname: starrailAccounts.nickname,
      level: starrailAccounts.level,
      staminaAlertThreshold: starrailAccounts.staminaAlertThreshold,
      cookieInvalid: starrailAccounts.cookieInvalid,
    })
    .from(starrailAccounts)
    .orderBy(starrailAccounts.id);
}

export async function recentCheckins(limit = 20) {
  return db()
    .select({ log: starrailCheckinLogs, nickname: starrailAccounts.nickname, uid: starrailAccounts.uid })
    .from(starrailCheckinLogs)
    .innerJoin(starrailAccounts, eq(starrailCheckinLogs.accountId, starrailAccounts.id))
    .orderBy(desc(starrailCheckinLogs.createdAt))
    .limit(limit);
}

/** 新增或更新 cookie：用 cookie 查出所有星穹鐵道角色，每個角色存一列（同 UID 就更新） */
export async function linkAccount(rawCookie: string): Promise<ActionResult> {
  const parsed = parseHoyolabCookie(rawCookie);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const roles = await fetchGameRoles(parsed.cookie);
  if (!roles.ok) return { ok: false, error: roles.message };
  if (roles.data.length === 0) return { ok: false, error: "這個 HoYoLAB 帳號底下沒有星穹鐵道角色" };

  const cookieEncrypted = encryptSecret(parsed.cookie);
  const now = new Date();
  for (const role of roles.data) {
    const values = { ltuid: parsed.ltuid, cookieEncrypted, nickname: role.nickname, region: role.region, level: role.level };
    await db()
      .insert(starrailAccounts)
      .values({ ...values, uid: role.uid })
      .onConflictDoUpdate({ target: starrailAccounts.uid, set: { ...values, cookieInvalid: false, updatedAt: now } });
  }
  const linked = `已連結 ${roles.data.map((r) => `${r.nickname ?? "?"}（${r.uid}）`).join("、")}`;
  return { ok: true, message: parsed.hasLtmid ? linked : `${linked}。建議一併貼上 ltmid_v2，否則即時便箋可能失敗` };
}

export async function removeAccount(id: number): Promise<void> {
  await db().delete(starrailAccounts).where(eq(starrailAccounts.id, id));
}

export async function setStaminaThreshold(id: number, threshold: number | null): Promise<void> {
  await db()
    .update(starrailAccounts)
    .set({ staminaAlertThreshold: threshold, lastStaminaAlertAt: null, updatedAt: new Date() })
    .where(eq(starrailAccounts.id, id));
}

/** cookie 失效標記只從這裡寫：比對資料庫裡的值而不是記憶體裡的帳號，同一次簽到先清掉再設上時才不會讀到舊值而跳過；回傳有沒有改 */
async function setCookieInvalid(accountId: number, invalid: boolean): Promise<boolean> {
  const updated = await db()
    .update(starrailAccounts)
    .set({ cookieInvalid: invalid, updatedAt: new Date() })
    .where(and(eq(starrailAccounts.id, accountId), ne(starrailAccounts.cookieInvalid, invalid)))
    .returning({ id: starrailAccounts.id });
  return updated.length > 0;
}

/** fetchedAt 是向 HoYoLAB 查詢的時間：快取最多 5 分鐘，回滿時間要從這裡起算 */
export type DailyNoteResult =
  | { ok: true; note: DailyNote; fetchedAt: Date; cookieInvalid: false }
  | { ok: false; message: string; fetchedAt: Date; cookieInvalid: boolean };

/** 頁面的即時便箋：只讀不寫才能放進快取；cookie 失效標記由頁面在回應後用 syncCookieInvalid 寫回 */
export async function dailyNoteFor(accountId: number): Promise<DailyNoteResult> {
  const [account] = await db().select().from(starrailAccounts).where(eq(starrailAccounts.id, accountId));
  if (!account) return { ok: false, message: "找不到這個帳號，請重新整理頁面", fetchedAt: new Date(), cookieInvalid: false };

  let cookie: string;
  try {
    cookie = decryptSecret(account.cookieEncrypted);
  } catch {
    return { ok: false, message: UNDECRYPTABLE, fetchedAt: new Date(), cookieInvalid: true };
  }
  const result = await fetchDailyNote(cookie, account.uid, account.region);
  const fetchedAt = new Date();
  return result.ok ? { ok: true, note: result.data, fetchedAt, cookieInvalid: false } : { ok: false, message: result.message, fetchedAt, cookieInvalid: result.cookieInvalid };
}

/** 頁面在回應後（after()）依便箋結果同步 cookie 失效標記；有改才讓帳號的快取失效 */
export async function syncCookieInvalid(accountId: number, invalid: boolean): Promise<boolean> {
  const changed = await setCookieInvalid(accountId, invalid);
  if (changed) expireTags(starrailTags.accounts);
  return changed;
}

export async function getDailyNote(account: StarrailAccount): Promise<HoyolabResult<DailyNote>> {
  const cookie = await cookieOf(account);
  if (cookie === null) return { ok: false, retcode: null, message: UNDECRYPTABLE, cookieInvalid: true, raw: null };
  const result = await fetchDailyNote(cookie, account.uid, account.region);
  await setCookieInvalid(account.id, !result.ok && result.cookieInvalid);
  return result;
}

/** 簽到是以 HoYoLAB 帳號為單位，紀錄掛在觸發簽到的那個角色上 */
export async function checkin(account: StarrailAccount): Promise<ActionResult> {
  const cookie = await cookieOf(account);
  if (cookie === null) {
    await db().insert(starrailCheckinLogs).values({ accountId: account.id, result: "failed", message: UNDECRYPTABLE });
    return { ok: false, error: UNDECRYPTABLE };
  }
  const info = await fetchCheckinInfo(cookie);
  if (info.ok) await setCookieInvalid(account.id, false);

  let result: "success" | "already" | "failed";
  let message: string;
  let totalSignDay: number | null = info.ok ? info.data.totalSignDay : null;

  if (info.ok && info.data.isSigned) {
    result = "already";
    message = "今天已經簽到過了";
  } else {
    const outcome = await signIn(cookie);
    ({ result, message } = outcome);
    if (outcome.result === "success" && totalSignDay !== null) totalSignDay += 1;
    // 原始回應可能帶有帳號資料，只記 retcode
    if (outcome.result === "failed") console.error("[starrail] 簽到失敗", account.uid, `retcode ${retcodeOf(outcome.raw)}`);
    await setCookieInvalid(account.id, outcome.cookieInvalid);
  }

  await db().insert(starrailCheckinLogs).values({ accountId: account.id, result, message, totalSignDay });
  return result === "failed" ? { ok: false, error: message } : { ok: true, message, already: result === "already" };
}

/** 頁面上的「立即簽到」只帶帳號 id */
export async function checkinAccount(id: number): Promise<ActionResult> {
  const [account] = await db().select().from(starrailAccounts).where(eq(starrailAccounts.id, id));
  if (!account) return { ok: false, error: "找不到這個帳號" };
  return checkin(account);
}

export async function checkinAll(): Promise<string> {
  const accounts = await listAccounts();
  if (accounts.length === 0) return "沒有連結的帳號";

  const lines: string[] = [];
  const seenLtuid = new Map<string, ActionResult>();
  for (const account of accounts) {
    // 同一個 HoYoLAB 帳號只送一次簽到，其餘角色沿用結果
    const result = seenLtuid.get(account.ltuid) ?? (await isolate(account, () => checkin(account)));
    seenLtuid.set(account.ltuid, result);
    lines.push(`${account.nickname ?? account.uid}：${result.ok ? result.message : `失敗 — ${result.error}`}`);
  }

  const results = [...seenLtuid.values()];
  if (results.every((r) => r.ok && r.already)) return lines.join("；");
  const failed = results.some((r) => !r.ok);
  await notify({ module: MODULE_ID, kind: "checkin", title: failed ? "星穹鐵道簽到：有失敗" : "星穹鐵道簽到完成", body: lines.join("\n"), url: CHECKIN_URL });
  return lines.join("；");
}

export async function checkStaminaAll(): Promise<string> {
  const accounts = await listAccounts();
  const lines: string[] = [];
  const now = new Date();

  for (const account of accounts) {
    const name = account.nickname ?? account.uid;
    const result = await isolate(account, () => checkStamina(account, now));
    lines.push(`${name}：${result.ok ? result.message : `查詢失敗 — ${result.error}`}`);
  }
  return lines.join("；") || "沒有連結的帳號";
}

async function checkStamina(account: StarrailAccount, now: Date): Promise<ActionResult> {
  const name = account.nickname ?? account.uid;
  const note = await getDailyNote(account);
  if (!note.ok) return { ok: false, error: note.message };

  const action = staminaAlertAction(note.data, account.staminaAlertThreshold, account.lastStaminaAlertAt !== null);
  if (action === "alert") {
    const fullAt = staminaFullAt(note.data, now);
    await notify({
      module: MODULE_ID,
      kind: "stamina",
      title: `${name} 的開拓力快滿了`,
      body: [
        `開拓力 ${note.data.stamina}/${note.data.maxStamina}（門檻 ${alertThreshold(note.data, account.staminaAlertThreshold)}）`,
        fullAt ? `預計 ${formatTaipeiTime(fullAt, now)} 回滿` : "已經滿了",
      ].join("\n"),
      url: "/starrail",
    });
  }
  if (action !== "none") {
    await db()
      .update(starrailAccounts)
      .set({ lastStaminaAlertAt: action === "alert" ? now : null })
      .where(eq(starrailAccounts.id, account.id));
  }
  return { ok: true, message: `${note.data.stamina}/${note.data.maxStamina}${action === "alert" ? "（已通知）" : ""}` };
}

/** 簽到紀錄屬於通知紀錄，只留最近 RETENTION_DAYS 天 */
export async function cleanupCheckinLogs(now = new Date()): Promise<string> {
  const deleted = await db()
    .delete(starrailCheckinLogs)
    .where(lt(starrailCheckinLogs.createdAt, retentionCutoff(now)))
    .returning({ id: starrailCheckinLogs.id });
  return `刪除 ${deleted.length} 筆超過 ${RETENTION_DAYS} 天的簽到紀錄`;
}

/** 換金鑰後把還沒用目前金鑰加密的 cookie 改用目前金鑰；單筆失敗不影響其他筆 */
export async function reencryptCookies(): Promise<string> {
  const accounts = await listAccounts();
  if (accounts.length === 0) return "沒有連結的帳號";

  let reencrypted = 0;
  let failed = 0;
  for (const account of accounts.filter((a) => needsReencrypt(a.cookieEncrypted))) {
    try {
      // 只在密文沒變時寫回：期間重新連結寫入的新 cookie 不能被舊的蓋掉
      const [updated] = await db()
        .update(starrailAccounts)
        .set({ cookieEncrypted: encryptSecret(decryptSecret(account.cookieEncrypted)) })
        .where(and(eq(starrailAccounts.id, account.id), eq(starrailAccounts.cookieEncrypted, account.cookieEncrypted)))
        .returning({ id: starrailAccounts.id });
      if (updated) reencrypted++;
    } catch (error) {
      failed++;
      logError("starrail", "cookie 重新加密失敗", error, account.uid);
    }
  }
  return `${accounts.length} 筆 cookie，重新加密 ${reencrypted} 筆${failed ? `（${failed} 筆失敗，詳見伺服器 log）` : ""}`;
}

/** 單一帳號出錯（資料庫、程式錯誤）不能中斷整批排程；錯誤細節只進 log */
async function isolate(account: StarrailAccount, work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (error) {
    logError("starrail", "處理帳號時發生錯誤", error, account.uid);
    return { ok: false, error: "發生錯誤（詳見伺服器 log）" };
  }
}
