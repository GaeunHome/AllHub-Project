import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { logError } from "@/core/errors";
import { fetchCheckinInfo, signIn } from "../lib/hoyolab";
import { CHECKIN_PAGE } from "../lib/urls";
import { starrailAccounts, starrailCheckinLogs, type StarrailAccount } from "../data/schema";
import { cookieOf, isolate, listAccounts, ownAccount, setCookieInvalid, trackingAccountChanges, UNDECRYPTABLE, type AccountChanges, type Outcome } from "./accounts";
import { notifyOwner } from "./notices";

/** already 是今天已經簽過 排程不為這種結果發通知 */
type CheckinResult = Outcome<{ message: string; already?: boolean }>;

/** 只列自己帳號的紀錄 頁面一次只看一個帳號 給了 id 就只列那個帳號的 */
export async function recentCheckins(userId: string, limit = 20, accountId?: number) {
  return db()
    .select({ log: starrailCheckinLogs, nickname: starrailAccounts.nickname, uid: starrailAccounts.uid })
    .from(starrailCheckinLogs)
    .innerJoin(starrailAccounts, eq(starrailCheckinLogs.accountId, starrailAccounts.id))
    .where(and(eq(starrailAccounts.userId, userId), accountId === undefined ? undefined : eq(starrailCheckinLogs.accountId, accountId)))
    .orderBy(desc(starrailCheckinLogs.createdAt))
    .limit(limit);
}

/** 簽到以 HoYoLAB 帳號為單位 紀錄掛在觸發簽到的那個角色上 */
export async function checkin(account: StarrailAccount, changes?: AccountChanges): Promise<CheckinResult> {
  const cookie = await cookieOf(account, changes);
  if (cookie === null) {
    await db().insert(starrailCheckinLogs).values({ accountId: account.id, result: "failed", message: UNDECRYPTABLE });
    return { ok: false, error: UNDECRYPTABLE };
  }
  const info = await fetchCheckinInfo(cookie);
  if (info.ok) await setCookieInvalid(account.id, false, changes);

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
    // 原始回應可能帶有帳號資料 只記 retcode
    if (outcome.result === "failed") console.error("[starrail] 簽到失敗", account.uid, `retcode ${outcome.retcode}`);
    await setCookieInvalid(account.id, outcome.cookieInvalid, changes);
  }

  await db().insert(starrailCheckinLogs).values({ accountId: account.id, result, message, totalSignDay });
  return result === "failed" ? { ok: false, error: message } : { ok: true, message, already: result === "already" };
}

/**
 * 頁面上的立即簽到只帶帳號 id
 * accountChanged 讓 Server Action 只在 cookie 失效標記改了時讓帳號的快取失效
 */
export async function checkinAccount(userId: string, id: number): Promise<CheckinResult & { accountChanged: boolean }> {
  const [account] = await db().select().from(starrailAccounts).where(ownAccount(userId, id));
  if (!account) return { ok: false, error: "找不到這個帳號", accountChanged: false };
  const changes: AccountChanges = { changed: false };
  return { ...(await checkin(account, changes)), accountChanged: changes.changed };
}

export async function checkinAll(): Promise<string> {
  const accounts = await listAccounts();
  if (accounts.length === 0) return "沒有連結的帳號";

  const lines: string[] = [];
  const seenLtuid = new Map<string, CheckinResult>();
  const byOwner = new Map<string, { lines: string[]; results: CheckinResult[] }>();
  await trackingAccountChanges(async (changes) => {
    for (const account of accounts) {
      // 同一個 HoYoLAB 帳號只送一次簽到 其餘角色沿用結果
      const result = seenLtuid.get(account.ltuid) ?? (await isolate(account, () => checkin(account, changes)));
      seenLtuid.set(account.ltuid, result);
      const line = `${account.nickname ?? account.uid}：${result.ok ? result.message : `失敗 — ${result.error}`}`;
      lines.push(line);
      const owner = byOwner.get(account.userId) ?? { lines: [], results: [] };
      owner.lines.push(line);
      owner.results.push(result);
      byOwner.set(account.userId, owner);
    }
  });

  // 每個擁有者只收到自己帳號的結果 全都是今天已簽過的人不通知
  for (const [userId, owner] of byOwner) {
    if (owner.results.every((r) => r.ok && r.already)) continue;
    const failed = owner.results.some((r) => !r.ok);
    try {
      await notifyOwner(userId, { kind: "checkin", title: failed ? "星穹鐵道簽到：有失敗" : "星穹鐵道簽到完成", body: owner.lines.join("\n"), url: CHECKIN_PAGE });
    } catch (error) {
      logError("starrail", "簽到通知失敗", error);
    }
  }
  return lines.join("；");
}
