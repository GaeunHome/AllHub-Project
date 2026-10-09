import "server-only";
import { and, desc, eq, getTableColumns, isNull, lt, ne, or } from "drizzle-orm";
import { expireTags } from "@/core/cache";
import { decryptSecret, encryptSecret, needsReencrypt } from "@/core/crypto";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { RETENTION_DAYS, retentionCutoff } from "@/core/retention";
import type { StarrailCharacter } from "../lib/characters";
import { parseHoyolabCookie } from "../lib/cookie";
import type { Endgame, EndgameMode, EndgameSchedule } from "../lib/endgame";
import { fetchCharacters, fetchCheckinInfo, fetchDailyNote, fetchEndgame, fetchGameRoles, fetchLedger, redeemCode, signIn } from "../lib/hoyolab";
import type { Ledger } from "../lib/ledger";
import { normalizeRedeemCode, redeemCookieProblem } from "../lib/redeem";
import { defaultRoleSelection, likelyUnused, serverLabel } from "../lib/roles";
import { formatTaipeiTime, retcodeOf, staminaFullAt, type DailyNote, type Expedition, type HoyolabResult } from "../lib/responses";
import { starrailAccounts, starrailCheckinLogs, type StarrailAccount } from "../data/schema";
import { alertThreshold, staminaAlertAction } from "../lib/stamina";
import { starrailTags } from "./cache-tags";

/** already：今天已簽到過（排程不為這種結果發通知） */
export type ActionResult = { ok: true; message: string; already?: boolean } | { ok: false; error: string };

const UNDECRYPTABLE = "cookie 無法解密，請重新連結（換過 ENCRYPTION_KEY 的話，把舊金鑰放進 ENCRYPTION_KEY_PREVIOUS 即可恢復）";
const ACCOUNT_NOT_FOUND = "找不到這個帳號，請重新整理頁面";
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

// 頁面與 Server Action 傳進來的 userId 都是登入者：帳號 id 只在自己的帳號裡找，別人的一律當作不存在
const ownAccount = (userId: string, accountId: number) => and(eq(starrailAccounts.id, accountId), eq(starrailAccounts.userId, userId));

/** 排程要處理的帳號：沒有擁有者的列（部署空窗期舊程式連結的）通知不知道要給誰，略過；重新連結就會歸給連結的人。擁有者被停用時凍結，不用他的 cookie 簽到或查便箋 */
async function listAccounts(): Promise<(StarrailAccount & { userId: string })[]> {
  const rows = await db()
    .select(getTableColumns(starrailAccounts))
    .from(starrailAccounts)
    .innerJoin(coreUsers, and(eq(coreUsers.id, starrailAccounts.userId), isNull(coreUsers.disabledAt)))
    .orderBy(starrailAccounts.id);
  return rows.filter((row): row is StarrailAccount & { userId: string } => row.userId !== null);
}

/** 頁面顯示用的欄位：不含 cookie（連密文也不讀出來），可以放進快取 */
export type StarrailAccountView = Pick<StarrailAccount, "id" | "uid" | "nickname" | "region" | "level" | "staminaAlertThreshold" | "cookieInvalid">;

export async function listAccountViews(userId: string): Promise<StarrailAccountView[]> {
  return db()
    .select({
      id: starrailAccounts.id,
      uid: starrailAccounts.uid,
      nickname: starrailAccounts.nickname,
      region: starrailAccounts.region,
      level: starrailAccounts.level,
      staminaAlertThreshold: starrailAccounts.staminaAlertThreshold,
      cookieInvalid: starrailAccounts.cookieInvalid,
    })
    .from(starrailAccounts)
    .where(eq(starrailAccounts.userId, userId))
    .orderBy(starrailAccounts.id);
}

/** 給了帳號 id 就只列那個帳號的紀錄（頁面一次只看一個伺服器的帳號）；只列自己帳號的紀錄 */
export async function recentCheckins(userId: string, limit = 20, accountId?: number) {
  return db()
    .select({ log: starrailCheckinLogs, nickname: starrailAccounts.nickname, uid: starrailAccounts.uid })
    .from(starrailCheckinLogs)
    .innerJoin(starrailAccounts, eq(starrailCheckinLogs.accountId, starrailAccounts.id))
    .where(and(eq(starrailAccounts.userId, userId), accountId === undefined ? undefined : eq(starrailCheckinLogs.accountId, accountId)))
    .orderBy(desc(starrailCheckinLogs.createdAt))
    .limit(limit);
}

/** 連結時讓使用者選的角色：伺服器用中文名稱，預設勾等級最高的，等級很低的標示「可能是沒在玩的帳號」 */
export type RoleChoice = { uid: string; nickname: string | null; server: string; level: number | null; likelyUnused: boolean; selected: boolean };

/** ask：只有一個角色就直接連結，好幾個就回傳清單讓使用者選（還不寫入）；all：全部連結；UID 清單：只連結這些 */
export type RoleSelection = "ask" | "all" | string[];

export type LinkResult = ActionResult | { ok: false; error?: never; roles: RoleChoice[] };

/** 選到的 UID 已經是別人的：整批不寫入 */
class UidTakenError extends Error {
  constructor(readonly uid: string) {
    super("UID 已經被其他使用者連結");
  }
}

/** 新增或更新 cookie：用 cookie 查出星穹鐵道角色，選到的每個角色存一列（同 UID 就更新）；兩個步驟之間 cookie 留在瀏覽器的表單裡，伺服器不存 */
export async function linkAccount(userId: string, rawCookie: string, selection: RoleSelection = "all"): Promise<LinkResult> {
  const parsed = parseHoyolabCookie(rawCookie);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const roles = await fetchGameRoles(parsed.cookie);
  if (!roles.ok) return { ok: false, error: roles.message };
  if (roles.data.length === 0) return { ok: false, error: "這個 HoYoLAB 帳號底下沒有星穹鐵道角色" };

  if (selection === "ask" && roles.data.length > 1) {
    const preselected = defaultRoleSelection(roles.data);
    return {
      ok: false,
      roles: roles.data.map((role) => ({
        uid: role.uid,
        nickname: role.nickname,
        server: serverLabel(role.region, role.regionName),
        level: role.level,
        likelyUnused: likelyUnused(role, roles.data),
        selected: preselected.includes(role.uid),
      })),
    };
  }
  // 只信任 HoYoLAB 查到的角色：表單送來的 UID 只用來挑選，不在這個帳號底下的會被略過
  const chosen = Array.isArray(selection) ? roles.data.filter((role) => selection.includes(role.uid)) : roles.data;
  if (chosen.length === 0) return { ok: false, error: "請至少選一個要連結的帳號" };

  const cookieEncrypted = encryptSecret(parsed.cookie);
  const now = new Date();
  try {
    await db().transaction(async (tx) => {
      for (const role of chosen) {
        const values = { userId, ltuid: parsed.ltuid, cookieEncrypted, nickname: role.nickname, region: role.region, level: role.level };
        // 同 UID 只更新自己的列；沒有擁有者的（部署空窗期舊程式連結的）由貼得出有效 cookie 的人認領，別人的不動
        const [saved] = await tx
          .insert(starrailAccounts)
          .values({ ...values, uid: role.uid })
          .onConflictDoUpdate({
            target: starrailAccounts.uid,
            set: { ...values, cookieInvalid: false, updatedAt: now },
            setWhere: or(eq(starrailAccounts.userId, userId), isNull(starrailAccounts.userId)),
          })
          .returning({ id: starrailAccounts.id });
        if (!saved) throw new UidTakenError(role.uid);
      }
    });
  } catch (error) {
    if (error instanceof UidTakenError) return { ok: false, error: `UID ${error.uid} 已經被其他使用者連結了，同一個遊戲帳號只能連結在一個帳號底下` };
    throw error;
  }
  const linked = `已連結 ${chosen.map((r) => `${r.nickname ?? "?"}（${serverLabel(r.region, r.regionName)}，${r.uid}）`).join("、")}`;
  return { ok: true, message: parsed.hasLtmid ? linked : `${linked}。建議一併貼上 ltmid_v2，否則即時便箋可能失敗` };
}

export async function removeAccount(userId: string, id: number): Promise<void> {
  await db().delete(starrailAccounts).where(ownAccount(userId, id));
}

/** 回傳有沒有找到自己的這個帳號 */
export async function setStaminaThreshold(userId: string, id: number, threshold: number | null): Promise<boolean> {
  const updated = await db()
    .update(starrailAccounts)
    .set({ staminaAlertThreshold: threshold, lastStaminaAlertAt: null, updatedAt: new Date() })
    .where(ownAccount(userId, id))
    .returning({ id: starrailAccounts.id });
  return updated.length > 0;
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

/** 頁面向 HoYoLAB 讀資料前先取帳號與 cookie；只讀不寫（cookie 失效標記由頁面在回應後寫回），才能放進快取 */
async function pageAccount(
  userId: string,
  accountId: number,
): Promise<{ ok: true; account: StarrailAccount; cookie: string } | { ok: false; message: string; cookieInvalid: boolean }> {
  const [account] = await db().select().from(starrailAccounts).where(ownAccount(userId, accountId));
  if (!account) return { ok: false, message: ACCOUNT_NOT_FOUND, cookieInvalid: false };
  try {
    return { ok: true, account, cookie: decryptSecret(account.cookieEncrypted) };
  } catch {
    return { ok: false, message: UNDECRYPTABLE, cookieInvalid: true };
  }
}

/** fetchedAt 是向 HoYoLAB 查詢的時間：快取最多 5 分鐘，回滿時間要從這裡起算 */
export type DailyNoteResult =
  | { ok: true; note: DailyNote; expeditions: Expedition[]; fetchedAt: Date; cookieInvalid: false }
  | { ok: false; message: string; fetchedAt: Date; cookieInvalid: boolean };

/** 頁面的即時便箋：只讀不寫才能放進快取；cookie 失效標記由頁面在回應後用 syncCookieInvalid 寫回 */
export async function dailyNoteFor(userId: string, accountId: number): Promise<DailyNoteResult> {
  const target = await pageAccount(userId, accountId);
  if (!target.ok) return { ...target, fetchedAt: new Date() };
  const result = await fetchDailyNote(target.cookie, target.account.uid, target.account.region);
  const fetchedAt = new Date();
  if (!result.ok) return { ok: false, message: result.message, fetchedAt, cookieInvalid: result.cookieInvalid };
  const { expeditions = [], ...note } = result.data;
  return { ok: true, note, expeditions, fetchedAt, cookieInvalid: false };
}

/** 頁面讀戰績類資料失敗時的結果；cookie 失效標記由頁面在回應後寫回 */
type PageFailure = { ok: false; message: string; fetchedAt: Date; cookieInvalid: boolean };

/** 戰績類資料（外部資料，不存資料庫）共用的讀法：只讀不寫才能放進快取；失敗只記 retcode、格式不同只記欄位名稱，回應原文可能帶有帳號資料 */
async function readRecord<T extends { missing: string[] }>(
  userId: string,
  accountId: number,
  what: string,
  request: (cookie: string, account: StarrailAccount) => Promise<HoyolabResult<T>>,
): Promise<{ ok: true; data: T; fetchedAt: Date } | PageFailure> {
  const target = await pageAccount(userId, accountId);
  if (!target.ok) return { ...target, fetchedAt: new Date() };
  const result = await request(target.cookie, target.account);
  const fetchedAt = new Date();
  if (!result.ok) {
    console.error(`[starrail] 讀取${what}失敗`, accountId, `retcode ${result.retcode}`);
    return { ok: false, message: result.message, fetchedAt, cookieInvalid: result.cookieInvalid };
  }
  if (result.data.missing.length > 0) console.error(`[starrail] ${what}的格式和預期不同`, accountId, `缺少或看不懂：${result.data.missing.join("、")}`);
  return { ok: true, data: result.data, fetchedAt };
}

export type CharactersResult = { ok: true; characters: StarrailCharacter[]; fetchedAt: Date; cookieInvalid: false } | PageFailure;

export async function charactersFor(userId: string, accountId: number): Promise<CharactersResult> {
  const read = await readRecord(userId, accountId, "角色資料", (cookie, account) => fetchCharacters(cookie, account.uid, account.region));
  return read.ok ? { ok: true, characters: read.data.characters, fetchedAt: read.fetchedAt, cookieInvalid: false } : read;
}

export type LedgerFetch = { ok: true; ledger: Ledger; fetchedAt: Date; cookieInvalid: false } | PageFailure;

/** 開拓月曆；month 是 YYYYMM */
export async function ledgerFor(userId: string, accountId: number, month: string): Promise<LedgerFetch> {
  const read = await readRecord(userId, accountId, "開拓月曆", (cookie, account) => fetchLedger(cookie, account.uid, account.region, month));
  return read.ok ? { ok: true, ledger: read.data.ledger, fetchedAt: read.fetchedAt, cookieInvalid: false } : read;
}

export type EndgameFetch = { ok: true; endgame: Endgame; fetchedAt: Date; cookieInvalid: false } | PageFailure;

export async function endgameFor(userId: string, accountId: number, mode: EndgameMode, schedule: EndgameSchedule): Promise<EndgameFetch> {
  const read = await readRecord(userId, accountId, "終局戰績", (cookie, account) => fetchEndgame(cookie, account.uid, account.region, mode, schedule));
  return read.ok ? { ok: true, endgame: read.data.endgame, fetchedAt: read.fetchedAt, cookieInvalid: false } : read;
}

/** 兌換碼：兌換碼與結果都不存，log 只記 retcode；cookieFlagChanged 讓 Server Action 只在寫了失效標記時才讓快取失效 */
export type RedeemResult = ({ ok: true; message: string } | { ok: false; error: string }) & { cookieFlagChanged: boolean };

export async function redeemCodeFor(userId: string, accountId: number, input: string): Promise<RedeemResult> {
  const normalized = normalizeRedeemCode(input);
  if (!normalized.ok) return { ok: false, error: normalized.error, cookieFlagChanged: false };
  const [account] = await db().select().from(starrailAccounts).where(ownAccount(userId, accountId));
  if (!account) return { ok: false, error: ACCOUNT_NOT_FOUND, cookieFlagChanged: false };
  let cookie: string;
  try {
    cookie = decryptSecret(account.cookieEncrypted);
  } catch {
    return { ok: false, error: UNDECRYPTABLE, cookieFlagChanged: await setCookieInvalid(account.id, true) };
  }
  const problem = redeemCookieProblem(cookie);
  if (problem) return { ok: false, error: problem, cookieFlagChanged: false };

  const outcome = await redeemCode(cookie, account.uid, account.region, normalized.code);
  if (outcome.ok) return { ok: true, message: outcome.message, cookieFlagChanged: false };
  console.error("[starrail] 兌換失敗", accountId, `retcode ${outcome.retcode}`);
  return { ok: false, error: outcome.message, cookieFlagChanged: outcome.cookieInvalid ? await setCookieInvalid(account.id, true) : false };
}

/** 頁面在回應後（after()）依便箋結果同步 cookie 失效標記；有改才讓帳號的快取失效 */
export async function syncCookieInvalid(userId: string, accountId: number, invalid: boolean): Promise<boolean> {
  const [own] = await db().select({ id: starrailAccounts.id }).from(starrailAccounts).where(ownAccount(userId, accountId));
  if (!own) return false;
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
export async function checkinAccount(userId: string, id: number): Promise<ActionResult> {
  const [account] = await db().select().from(starrailAccounts).where(ownAccount(userId, id));
  if (!account) return { ok: false, error: "找不到這個帳號" };
  return checkin(account);
}

export async function checkinAll(): Promise<string> {
  const accounts = await listAccounts();
  if (accounts.length === 0) return "沒有連結的帳號";

  const lines: string[] = [];
  const seenLtuid = new Map<string, ActionResult>();
  const byOwner = new Map<string, { lines: string[]; results: ActionResult[] }>();
  for (const account of accounts) {
    // 同一個 HoYoLAB 帳號只送一次簽到，其餘角色沿用結果
    const result = seenLtuid.get(account.ltuid) ?? (await isolate(account, () => checkin(account)));
    seenLtuid.set(account.ltuid, result);
    const line = `${account.nickname ?? account.uid}：${result.ok ? result.message : `失敗 — ${result.error}`}`;
    lines.push(line);
    const owner = byOwner.get(account.userId) ?? { lines: [], results: [] };
    owner.lines.push(line);
    owner.results.push(result);
    byOwner.set(account.userId, owner);
  }

  // 每個擁有者只收到自己帳號的結果；都是「今天已經簽到過了」的人不通知
  for (const [userId, owner] of byOwner) {
    if (owner.results.every((r) => r.ok && r.already)) continue;
    const failed = owner.results.some((r) => !r.ok);
    try {
      await notify({ recipients: [userId], module: MODULE_ID, kind: "checkin", title: failed ? "星穹鐵道簽到：有失敗" : "星穹鐵道簽到完成", body: owner.lines.join("\n"), url: CHECKIN_URL });
    } catch (error) {
      logError("starrail", "簽到通知失敗", error);
    }
  }
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

async function checkStamina(account: StarrailAccount & { userId: string }, now: Date): Promise<ActionResult> {
  const name = account.nickname ?? account.uid;
  const note = await getDailyNote(account);
  if (!note.ok) return { ok: false, error: note.message };

  const action = staminaAlertAction(note.data, account.staminaAlertThreshold, account.lastStaminaAlertAt !== null);
  if (action === "alert") {
    const fullAt = staminaFullAt(note.data, now);
    await notify({
      recipients: [account.userId],
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

/** 換金鑰後把還沒用目前金鑰加密的 cookie 改用目前金鑰；單筆失敗不影響其他筆。沒有擁有者的列也處理：移除舊金鑰前要全部換好 */
export async function reencryptCookies(): Promise<string> {
  const accounts = await db().select().from(starrailAccounts).orderBy(starrailAccounts.id);
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
