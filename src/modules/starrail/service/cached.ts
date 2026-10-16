import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { EndgameMode, EndgameSchedule } from "../lib/endgame";
import {
  actCalendarFor,
  charactersFor,
  dailyNoteFor,
  endgameFor,
  ledgerFor,
  listAccountViews,
  profileFor,
  recentCheckins,
  type ActCalendarFetch,
  type CharactersResult,
  type DailyNoteResult,
  type EndgameFetch,
  type LedgerFetch,
  type StarrailAccountView,
} from "./accounts";
import { starrailTags } from "./cache-tags";

// 只給頁面用 排程與簽到要讀最新資料 直接用 accounts.ts
// userId 是登入者也是快取 key 別人的帳號 id 當作不存在

export async function cachedAccounts(userId: string): Promise<StarrailAccountView[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(starrailTags.accounts);
  return listAccountViews(userId);
}

/** 給了帳號 id 就只列那個帳號的紀錄 */
export async function cachedRecentCheckins(userId: string, accountId?: number): Promise<Awaited<ReturnType<typeof recentCheckins>>> {
  "use cache: remote";
  cacheLife("db");
  // 要 join 帳號表才知道是不是自己的 認領或刪除帳號都會改變結果
  cacheTag(starrailTags.checkins, starrailTags.accounts);
  return recentCheckins(userId, 20, accountId);
}

/** 參數只有使用者與帳號 id cookie 在函式裡才解密 不進 key 也不進回傳值 */
export async function cachedDailyNote(userId: string, accountId: number): Promise<DailyNoteResult> {
  "use cache: remote";
  cacheLife("external");
  // 讀了帳號的 cookie 與 UID 帳號被重新連結 簽到或排程改了時便箋跟著重查
  cacheTag(starrailTags.accounts);
  return dailyNoteFor(userId, accountId);
}

/**
 * 遊戲頭像不存資料庫 只回網址 不含 cookie
 * 讀不到時只快取幾分鐘 之後再試 不要一整天都是列車圖示
 */
export async function cachedProfile(userId: string, accountId: number): Promise<string | null> {
  "use cache: remote";
  // 讀了帳號的 cookie 與 UID 重新連結時跟著重查
  cacheTag(starrailTags.accounts);
  const avatar = await profileFor(userId, accountId);
  if (avatar) cacheLife("avatar");
  else cacheLife("external");
  return avatar;
}

/**
 * 角色資料只放快取不存資料庫
 * 參數只有使用者與帳號 id cookie 在函式裡才解密
 */
export async function cachedCharacters(userId: string, accountId: number): Promise<CharactersResult> {
  "use cache: remote";
  // 讀了帳號的 cookie 與 UID 帳號改了角色資料也跟著重查
  cacheTag(starrailTags.accounts);
  const result = await charactersFor(userId, accountId);
  // 資料不公開這類失敗時效期短一點 到 HoYoLAB 打開設定後幾分鐘內就看得到
  if (result.ok) cacheLife("records");
  else cacheLife("external");
  return result;
}

/** 開拓月曆不存資料庫 參數是使用者 帳號 id 與 YYYYMM 月份 */
export async function cachedLedger(userId: string, accountId: number, month: string): Promise<LedgerFetch> {
  "use cache: remote";
  cacheTag(starrailTags.accounts);
  const result = await ledgerFor(userId, accountId, month);
  if (result.ok) cacheLife("records");
  else cacheLife("external");
  return result;
}

/** 終局戰績不存資料庫 參數是使用者 帳號 id 模式與本期或上期 */
export async function cachedEndgame(userId: string, accountId: number, mode: EndgameMode, schedule: EndgameSchedule): Promise<EndgameFetch> {
  "use cache: remote";
  cacheTag(starrailTags.accounts);
  const result = await endgameFor(userId, accountId, mode, schedule);
  if (result.ok) cacheLife("records");
  else cacheLife("external");
  return result;
}

/** 活動日曆不存資料庫 參數是使用者與帳號 id 結束時間是絕對時間 剩幾天由頁面算 */
export async function cachedActCalendar(userId: string, accountId: number): Promise<ActCalendarFetch> {
  "use cache: remote";
  cacheTag(starrailTags.accounts);
  const result = await actCalendarFor(userId, accountId);
  if (result.ok) cacheLife("records");
  else cacheLife("external");
  return result;
}
