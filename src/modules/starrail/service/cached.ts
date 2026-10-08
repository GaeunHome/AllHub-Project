import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { dailyNoteFor, listAccountViews, recentCheckins, type DailyNoteResult, type StarrailAccountView } from "./accounts";
import { starrailTags } from "./cache-tags";

// 只給頁面用；排程與簽到要讀最新資料，直接用 accounts.ts

export async function cachedAccounts(): Promise<StarrailAccountView[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(starrailTags.accounts);
  return listAccountViews();
}

export async function cachedRecentCheckins(): Promise<Awaited<ReturnType<typeof recentCheckins>>> {
  "use cache: remote";
  cacheLife("db");
  // 紀錄旁的暱稱來自帳號表，重新連結改了暱稱也要重新讀
  cacheTag(starrailTags.checkins, starrailTags.accounts);
  return recentCheckins();
}

/** 參數只有帳號 id（會成為快取 key）；cookie 在函式裡才解密，不進 key 也不進回傳值 */
export async function cachedDailyNote(accountId: number): Promise<DailyNoteResult> {
  "use cache: remote";
  cacheLife("external");
  // 讀了帳號的 cookie 與 UID：重新連結、簽到或排程改了帳號，便箋也跟著重查
  cacheTag(starrailTags.accounts);
  return dailyNoteFor(accountId);
}
