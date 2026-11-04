import "server-only";
import { and, asc, count, desc, eq, max, notInArray } from "drizzle-orm";
import { takeCooldown } from "@/core/cooldown";
import { db } from "@/core/db";
import { starrailAccounts, starrailWarps, type StarrailAccount } from "../data/schema";
import { cookieKeys } from "../lib/cookie";
import { fetchWarpAuthkey, fetchWarpPage } from "../lib/hoyolab";
import { WARP_BANNERS, WARP_LIMIT, WARP_PAGE_SIZE, summarizeBanner, type BannerSummary, type Warp } from "../lib/warps";
import { UNDECRYPTABLE, cookieOf, isolate, listAccounts, ownAccount, pageAccount, trackingAccountChanges, type Outcome } from "./accounts";

// 躍遷紀錄 只新增不覆蓋 官方只留最近一段時間 存下來才不會消失

const PAGE_GAP_MS = 300;
/** 第一次要抓完整段 回應不對時也不能一直問下去 */
const MAX_PAGES = 200;
/** 每個帳號一天一次 兩個帳號一起第一次同步也夠用 超過的明天再做 */
const SYNC_BUDGET_MS = 120_000;
/** 按一次要問 HoYoverse 很多次 */
const MANUAL_COOLDOWN_MS = 60_000;

/** 換金鑰一定要這個鍵 其他鍵補得出來 */
const hasCookieToken = (cookie: string) => cookieKeys(cookie).has("cookie_token_v2");
const NEEDS_COOKIE_TOKEN = "躍遷紀錄要用 cookie 裡的 cookie_token_v2：請用「新增帳號或更新 cookie」重新貼上完整的 cookie";

type WarpClock = { now: () => number; sleep: (ms: number) => Promise<void> };
const realClock: WarpClock = { now: () => Date.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

/** 看到存過的就停 整個卡池讀完才回傳 中途失敗時不寫入 不然這段缺口之後補不回來 */
async function newWarps(accountId: number, bannerType: number, authkey: string, clock: WarpClock): Promise<Outcome<{ warps: Warp[] }>> {
  const [{ latest }] = await db()
    .select({ latest: max(starrailWarps.id) })
    .from(starrailWarps)
    .where(and(eq(starrailWarps.accountId, accountId), eq(starrailWarps.bannerType, bannerType)));
  const warps: Warp[] = [];
  let endId = "0";
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await clock.sleep(PAGE_GAP_MS);
    const result = await fetchWarpPage(authkey, bannerType, endId);
    if (!result.ok) {
      console.error("[starrail] 讀取躍遷紀錄失敗", accountId, bannerType, `retcode ${result.retcode}`);
      return { ok: false, error: result.message };
    }
    if (result.data.missing.length > 0) console.error("[starrail] 躍遷紀錄的格式和預期不同", accountId, `缺少或看不懂：${result.data.missing.join("、")}`);
    const fresh = result.data.warps.filter((warp) => latest === null || BigInt(warp.id) > BigInt(latest));
    warps.push(...fresh);
    const last = result.data.warps.at(-1);
    if (!last || fresh.length < result.data.warps.length || result.data.warps.length < WARP_PAGE_SIZE) break;
    endId = last.id;
  }
  return { ok: true, warps };
}

async function saveWarps(accountId: number, warps: Warp[]): Promise<number> {
  if (warps.length === 0) return 0;
  const inserted = await db()
    .insert(starrailWarps)
    .values(warps.map((warp) => ({ ...warp, accountId })))
    .onConflictDoNothing()
    .returning({ id: starrailWarps.id });
  return inserted.length;
}

/** 只留最新的 limit 筆 id 是 bigint 用數字比 */
export async function pruneWarps(accountId: number, limit = WARP_LIMIT): Promise<void> {
  const keep = db().select({ id: starrailWarps.id }).from(starrailWarps).where(eq(starrailWarps.accountId, accountId)).orderBy(desc(starrailWarps.id)).limit(limit);
  await db()
    .delete(starrailWarps)
    .where(and(eq(starrailWarps.accountId, accountId), notInArray(starrailWarps.id, keep)));
}

async function syncAccount(account: StarrailAccount, cookie: string, clock: WarpClock): Promise<Outcome<{ added: number }>> {
  if (!hasCookieToken(cookie)) return { ok: false, error: NEEDS_COOKIE_TOKEN };
  const key = await fetchWarpAuthkey(cookie, account.uid, account.region);
  if (!key.ok) {
    console.error("[starrail] 換不到躍遷紀錄的金鑰", account.id, `retcode ${key.retcode}`);
    return { ok: false, error: key.message };
  }
  if (!key.data) return { ok: false, error: "HoYoverse 沒有回傳金鑰，稍後再試" };
  let added = 0;
  for (const banner of WARP_BANNERS) {
    const fresh = await newWarps(account.id, banner.id, key.data, clock);
    if (!fresh.ok) return fresh;
    added += await saveWarps(account.id, fresh.warps);
  }
  if (added > 0) await pruneWarps(account.id);
  return { ok: true, added };
}

export async function syncWarpsFor(userId: string, accountId: number, clock: WarpClock = realClock): Promise<Outcome<{ added: number }>> {
  const target = await pageAccount(userId, accountId);
  if (!target.ok) return { ok: false, error: target.message };
  return syncAccount(target.account, target.cookie, clock);
}

/** 畫面上的立即更新 每人每分鐘一次 */
export async function syncWarpsManually(userId: string, accountId: number, now = new Date()): Promise<Outcome<{ added: number }>> {
  const wait = await takeCooldown("starrail:warps", userId, MANUAL_COOLDOWN_MS, now);
  if (wait > 0) return { ok: false, error: `剛更新過，${wait} 秒後再試` };
  return syncWarpsFor(userId, accountId);
}

/** 排程 擁有者停用或 cookie 失效的不處理 一個帳號出錯不影響其他 摘要只有數字 */
export async function syncAllWarps(clock: WarpClock = realClock): Promise<string> {
  const accounts = (await listAccounts()).filter((account) => !account.cookieInvalid);
  const deadline = clock.now() + SYNC_BUDGET_MS;
  const tally = { synced: 0, added: 0, failed: 0, skipped: 0 };
  await trackingAccountChanges(async (changes) => {
    for (const account of accounts) {
      if (clock.now() >= deadline) {
        tally.skipped += 1;
        continue;
      }
      const result = await isolate<{ added: number; unsupported: boolean }>(account, async () => {
        const cookie = await cookieOf(account, changes);
        if (cookie === null) return { ok: false, error: UNDECRYPTABLE };
        // 舊的 cookie 沒貼這個鍵 重新貼上前先略過 不算失敗
        if (!hasCookieToken(cookie)) return { ok: true, added: 0, unsupported: true };
        return { ...(await syncAccount(account, cookie, clock)), unsupported: false };
      });
      if (!result.ok) tally.failed += 1;
      else if (!result.unsupported) {
        tally.synced += 1;
        tally.added += result.added;
      }
    }
  });
  const parts = [`同步 ${tally.synced} 個帳號，新增 ${tally.added} 抽`];
  if (tally.failed > 0) parts.push(`${tally.failed} 個失敗`);
  if (tally.skipped > 0) parts.push(`${tally.skipped} 個超過時間略過`);
  return parts.join("，");
}

/** 別人的帳號當作不存在 */
async function isOwnAccount(userId: string, accountId: number): Promise<boolean> {
  const rows = await db().select({ id: starrailAccounts.id }).from(starrailAccounts).where(ownAccount(userId, accountId));
  return rows.length > 0;
}

export async function warpSummaryFor(userId: string, accountId: number): Promise<BannerSummary[] | null> {
  if (!(await isOwnAccount(userId, accountId))) return null;
  const rows = await db().select().from(starrailWarps).where(eq(starrailWarps.accountId, accountId)).orderBy(asc(starrailWarps.id));
  return WARP_BANNERS.map((banner) => summarizeBanner(banner, rows.filter((row) => row.bannerType === banner.id)));
}

export type WarpList = { warps: Warp[]; total: number };

/** page 從 1 開始 新的在前 */
export async function warpListFor(userId: string, accountId: number, bannerType: number, page: number): Promise<WarpList | null> {
  if (!(await isOwnAccount(userId, accountId))) return null;
  const inBanner = and(eq(starrailWarps.accountId, accountId), eq(starrailWarps.bannerType, bannerType));
  const [[{ total }], warps] = await Promise.all([
    db().select({ total: count() }).from(starrailWarps).where(inBanner),
    db().select().from(starrailWarps).where(inBanner).orderBy(desc(starrailWarps.id)).limit(WARP_PAGE_SIZE).offset((page - 1) * WARP_PAGE_SIZE),
  ]);
  return { warps, total };
}
