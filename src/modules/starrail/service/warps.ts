import "server-only";
import { reportService } from "@/core/status";
import { cookieKeys } from "../lib/cookie";
import { fetchWarpPage, warpLogin } from "../lib/hoyolab";
import type { HoyolabResult } from "../lib/responses";
import { DAILY_LIMIT, DATA_NOT_PUBLIC, GEETEST } from "../lib/retcodes";
import { NEEDS_COOKIE_TOKEN, WARP_BANNERS, summarizeBanner, type BannerSummary, type WarpBanner, type WarpCursor, type WarpRow } from "../lib/warps";
import type { StarrailAccount } from "../data/schema";
import { pageAccount } from "./accounts";
import type { PageFailure } from "./page-reads";

// 躍遷紀錄打開頁面時才向 HoYoLAB 讀 不存資料庫 cached.ts 包上快取

/** 一個一個問 不要一次全部送出去 */
const REQUEST_GAP_MS = 200;
/** 回應不對時也不能一直問下去 */
const MAX_PAGES = 30;
/** 這幾個是那個帳號自己的狀況 HoYoLAB 本身沒事 */
const ACCOUNT_RETCODES: readonly (number | null)[] = [DATA_NOT_PUBLIC, DAILY_LIMIT, ...GEETEST];
/** 快取裡的結果不是這次讀到的 超過這個時間就不回報 */
const FRESH_READ_MS = 30_000;
const NOT_FINISHED = { ok: false, retcode: null, message: "躍遷紀錄暫時無法讀取", cookieInvalid: false } as const;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * serviceDown 是 HoYoLAB 那邊出問題 使用者自己的不算
 * readAt 是真的向 HoYoLAB 讀的時間
 */
export type WarpsFetch = ({ ok: true; summaries: BannerSummary[] } | (PageFailure & { serviceDown: boolean })) & { readAt: number };
type WarpsResult = { ok: true; summaries: BannerSummary[] } | (PageFailure & { serviceDown: boolean });

type Sleep = typeof realSleep;
type Target = { account: StarrailAccount; cookie: string };

/** 回應原文可能帶有帳號資料 log 只記 retcode 與缺少的欄位名稱 */
async function bannerRows({ account, cookie }: Target, banner: WarpBanner, sleep: Sleep): Promise<HoyolabResult<WarpRow[]>> {
  const rows: WarpRow[] = [];
  let cursor: WarpCursor | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(REQUEST_GAP_MS);
    const result = await fetchWarpPage(cookie, account.uid, account.region, banner.gachaType, cursor);
    if (!result.ok) {
      console.error("[starrail] 讀取躍遷紀錄失敗", account.id, banner.id, `retcode ${result.retcode}`);
      return result;
    }
    if (result.data.missing.length > 0) console.error("[starrail] 躍遷紀錄的格式和預期不同", account.id, `缺少或看不懂：${result.data.missing.join("、")}`);
    if (result.data.incomplete) {
      console.error("[starrail] 躍遷紀錄讀不到下一頁", account.id, banner.id);
      return NOT_FINISHED;
    }
    rows.push(...result.data.rows);
    if (!result.data.next) return { ok: true, data: rows };
    cursor = result.data.next;
  }
  console.error("[starrail] 躍遷紀錄超過頁數上限", account.id, banner.id);
  return NOT_FINISHED;
}

const failed = ({ retcode, message, cookieInvalid }: { retcode: number | null; message: string; cookieInvalid: boolean }): WarpsResult => ({ ok: false, message, serviceDown: !cookieInvalid && !ACCOUNT_RETCODES.includes(retcode) });

async function readWarps(userId: string, accountId: number, sleep: Sleep): Promise<WarpsResult> {
  const target = await pageAccount(userId, accountId);
  if (!target.ok) return { ok: false, message: target.message, serviceDown: false };
  if (!cookieKeys(target.cookie).has("cookie_token_v2")) return { ok: false, message: NEEDS_COOKIE_TOKEN, serviceDown: false };
  const login = await warpLogin(target.cookie, target.account.uid, target.account.region);
  if (!login.ok) {
    console.error("[starrail] 登入躍遷紀錄的活動頁失敗", accountId, `retcode ${login.retcode}`);
    return failed(login);
  }
  const summaries: BannerSummary[] = [];
  for (const banner of WARP_BANNERS) {
    if (summaries.length > 0) await sleep(REQUEST_GAP_MS);
    const rows = await bannerRows({ account: target.account, cookie: login.data }, banner, sleep);
    if (!rows.ok) return failed(rows);
    summaries.push(summarizeBanner(banner, rows.data));
  }
  return { ok: true, summaries };
}

/** 別人的帳號當作不存在 讀不到不動帳號的 cookie 失效標記 同開拓月曆 */
export async function warpsFor(userId: string, accountId: number, sleep: Sleep = realSleep): Promise<WarpsFetch> {
  return { ...(await readWarps(userId, accountId, sleep)), readAt: Date.now() };
}

/**
 * 快取函式裡不能寫 由頁面在回應送出後回報
 * 快取裡舊的成功不算 不然會蓋掉別人剛記下的問題
 */
export async function reportWarps(read: WarpsFetch, now = Date.now()): Promise<void> {
  if (now - read.readAt > FRESH_READ_MS) return;
  if (read.ok) await reportService("starrail:warps", null);
  else if (read.serviceDown) await reportService("starrail:warps", read.message);
}
