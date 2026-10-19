import "server-only";
import { and, inArray } from "drizzle-orm";
import { db } from "@/core/db";
import { logError } from "@/core/errors";
import { DAY_MS, taipeiDateKey } from "@/core/time";
import { fetchActiveCodes, type PublicCode } from "../lib/codes";
import { withAccountIds } from "../lib/cookie";
import { redeemCode } from "../lib/hoyolab";
import { redeemCookieProblem, redeemVerdict } from "../lib/redeem";
import { serverLabel } from "../lib/roles";
import { accountHref, STARRAIL_HREF } from "../lib/urls";
import { starrailRedeemCodes, type StarrailAccount } from "../data/schema";
import { cookieOf, listAccounts, trackingAccountChanges, type AccountChanges } from "./accounts";
import { notifiedOwnerSince, notifyOnce, notifyOwner } from "./notices";

/** HoYoLAB 兩次兌換之間要等約 5 秒 從上一次的回應起算 多留一秒 */
const REDEEM_GAP_MS = 6_000;
/** 讀清單 5 秒 兌換 30 秒 加上最後一個請求的 10 秒 沒有 Fluid compute 也在 60 秒內跑完 */
const REDEEM_BUDGET_MS = 30_000;
const COOKIE_NOTICE_KIND = "redeem_cookie";
/** 排程在那個小時內的任何時間都可能跑 少算半天 隔週同一天才會再通知 */
const COOKIE_NOTICE_INTERVAL_MS = 6.5 * DAY_MS;

/** 測試換成假的時鐘 不用真的等 */
type RedeemClock = { now: () => number; sleep: (ms: number) => Promise<void> };
const realClock: RedeemClock = { now: () => Date.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

type Queue = { account: StarrailAccount; cookie: string; codes: PublicCode[] };
type Redeemed = { account: StarrailAccount; code: PublicCode };
/** 同一個擁有者的同一個 HoYoLAB 帳號 兌換成功的碼合寄一則 */
type Group = { userId: string; ltuid: string; queues: Queue[]; redeemed: Redeemed[] };

const nameOf = (account: StarrailAccount) => `${account.nickname ?? account.uid}（${serverLabel(account.region)}）`;

/**
 * 每天一次 替打開自動兌換的帳號送出還沒試過的兌換碼
 * 冷卻是每個 HoYoLAB 帳號各算 不同的人輪流送 一個人的等待時間裡先送別人的
 */
export async function autoRedeemAll(clock: RedeemClock = realClock): Promise<string> {
  const accounts = (await listAccounts()).filter((account) => account.autoRedeem && !account.cookieInvalid);
  if (accounts.length === 0) return "沒有打開自動兌換的帳號";
  const codes = await fetchActiveCodes();
  if (codes === null) return "讀不到兌換碼清單，明天再試";
  if (codes.length === 0) return "目前沒有有效的兌換碼";

  return trackingAccountChanges(async (changes) => {
    const { queues, skipped } = await buildQueues(accounts, codes, changes);
    const pending = queues.reduce((sum, queue) => sum + queue.codes.length, 0);
    if (pending === 0) return `${accounts.length} 個帳號都沒有新的兌換碼${skipped ? `（${skipped} 個帳號的 cookie 不能兌換）` : ""}`;

    const run = await redeemQueues(queues, clock);
    for (const account of run.cookieRejected) await noticeCookieRejected(account, new Date(clock.now()));
    return [
      `${accounts.length} 個帳號`,
      `兌換成功 ${run.redeemed} 個`,
      run.settled > run.redeemed ? `已兌換過或無效 ${run.settled - run.redeemed} 個` : null,
      skipped ? `${skipped} 個帳號的 cookie 不能兌換` : null,
      run.cookieRejected.length > 0 ? `${run.cookieRejected.length} 個帳號的 cookie 被拒絕` : null,
      run.stoppedByRisk ? "HoYoLAB 要求驗證，今天先停" : null,
      run.left > 0 ? `剩 ${run.left} 個明天再試` : null,
    ]
      .filter(Boolean)
      .join("，");
  });
}

/** 每個帳號還沒試過的兌換碼 cookie 解不開或少了兌換要用的鍵就略過 */
async function buildQueues(accounts: StarrailAccount[], codes: PublicCode[], changes: AccountChanges): Promise<{ queues: Queue[]; skipped: number }> {
  const accountIds = accounts.map((account) => account.id);
  const tried = await db()
    .select({ accountId: starrailRedeemCodes.accountId, code: starrailRedeemCodes.code })
    .from(starrailRedeemCodes)
    .where(and(inArray(starrailRedeemCodes.accountId, accountIds), inArray(starrailRedeemCodes.code, codes.map((code) => code.code))));
  const triedKeys = new Set(tried.map((row) => `${row.accountId}:${row.code}`));
  const queues: Queue[] = [];
  let skipped = 0;
  for (const account of accounts) {
    const cookie = await cookieOf(account, changes);
    if (cookie === null || redeemCookieProblem(withAccountIds(cookie)) !== null) {
      skipped++;
      continue;
    }
    queues.push({ account, cookie, codes: codes.filter((code) => !triedKeys.has(`${account.id}:${code.code}`)) });
  }
  return { queues, skipped };
}

/**
 * 輪到冷卻最早結束的帳號 超過時間就停 剩下的明天再試
 * 要求驗證時整批停下 cookie 失效 太頻繁 連不上或冷卻還沒過的那個 HoYoLAB 帳號今天先跳過
 */
async function redeemQueues(queues: Queue[], clock: RedeemClock) {
  const deadline = clock.now() + REDEEM_BUDGET_MS;
  const readyAt = new Map<string, number>();
  const groups = groupQueues(queues);
  const cookieRejected: StarrailAccount[] = [];
  let redeemed = 0;
  let settled = 0;
  let stoppedByRisk = false;

  const active = () => queues.filter((queue) => queue.codes.length > 0);
  const readyOf = (queue: Queue) => readyAt.get(queue.account.ltuid) ?? 0;
  while (active().length > 0) {
    const queue = active().reduce((first, candidate) => (readyOf(candidate) < readyOf(first) ? candidate : first));
    const wait = Math.max(0, readyOf(queue) - clock.now());
    if (clock.now() + wait > deadline) break;
    if (wait > 0) await clock.sleep(wait);

    const { account, cookie } = queue;
    const code = queue.codes.shift()!;
    const outcome = await redeemCode(cookie, account.uid, account.region, code.code);
    readyAt.set(account.ltuid, clock.now() + REDEEM_GAP_MS);
    const verdict = redeemVerdict(outcome);

    if (verdict.kind === "success") {
      groups.find((group) => group.queues.includes(queue))!.redeemed.push({ account, code });
      redeemed++;
    } else {
      // 兌換碼與回應原文都不進 log 只記帳號 id 與 retcode
      console.error("[starrail] 自動兌換沒有成功", account.id, `retcode ${outcome.retcode}`);
    }
    if (verdict.settled) {
      settled++;
      await db().insert(starrailRedeemCodes).values({ accountId: account.id, code: code.code, result: verdict.kind }).onConflictDoNothing();
    } else if (verdict.kind === "risk") {
      stoppedByRisk = true;
      break;
    } else if (verdict.kind === "cookie" || verdict.kind === "rate_limit" || verdict.kind === "network" || verdict.kind === "cooldown") {
      // 同一個 HoYoLAB 帳號的其他角色今天也先跳過
      for (const other of queues) {
        if (other.account.ltuid !== account.ltuid) continue;
        if (verdict.kind === "cookie" && (other === queue || other.codes.length > 0)) cookieRejected.push(other.account);
        other.codes = [];
      }
    }
    // 一個 HoYoLAB 帳號試完就先寄 不等別人
    for (const group of groups) if (group.queues.every((q) => q.codes.length === 0)) await notifyRedeemed(group);
  }
  // 時間到或要求驗證而停下時 還沒寄的一起寄
  for (const group of groups) await notifyRedeemed(group);
  return { redeemed, settled, stoppedByRisk, cookieRejected, left: queues.reduce((sum, queue) => sum + queue.codes.length, 0) };
}

function groupQueues(queues: Queue[]): Group[] {
  const groups: Group[] = [];
  for (const queue of queues) {
    const { userId, ltuid } = queue.account;
    const group = groups.find((g) => g.userId === userId && g.ltuid === ltuid);
    if (group) group.queues.push(queue);
    else groups.push({ userId, ltuid, queues: [queue], redeemed: [] });
  }
  return groups;
}

/** 寄出這一組還沒寄的 寫出每個角色兌換到的碼與社群寫的獎勵 */
async function notifyRedeemed(group: Group): Promise<void> {
  const items = group.redeemed.splice(0);
  if (items.length === 0) return;
  const accountIds = new Set(items.map((item) => item.account.id));
  try {
    await notifyOwner(group.userId, {
      kind: "redeem",
      title: items.length === 1 ? `已自動兌換 ${items[0].code.code}` : `已自動兌換 ${items.length} 個兌換碼`,
      body: [...items.map(({ account, code }) => `${nameOf(account)}：${code.code}${code.rewards ? `（${code.rewards}）` : ""}`), "獎勵會寄到遊戲內信箱"].join("\n"),
      url: accountIds.size === 1 ? accountHref(items[0].account.id) : STARRAIL_HREF,
    });
  } catch (error) {
    logError("starrail", "自動兌換通知失敗", error);
  }
}

/**
 * cookie 被 HoYoLAB 拒絕時請擁有者重新貼上 一個遊戲帳號一週一則
 * 認領一天後就刪 一週內寄過沒有看通知紀錄 認領只擋同一天重送的排程
 */
async function noticeCookieRejected(account: StarrailAccount, now: Date): Promise<void> {
  const url = accountHref(account.id);
  try {
    if (await notifiedOwnerSince(account.userId, COOKIE_NOTICE_KIND, new Date(now.getTime() - COOKIE_NOTICE_INTERVAL_MS), url)) return;
    await notifyOnce(account, taipeiDateKey(now), now, {
      kind: COOKIE_NOTICE_KIND,
      title: `${nameOf(account)} 自動兌換失敗：cookie 已失效`,
      body: "請用「新增帳號或更新 cookie」重新貼上，修好之前每週提醒一次",
      url,
    });
  } catch (error) {
    logError("starrail", "自動兌換 cookie 失效通知失敗", error);
  }
}
