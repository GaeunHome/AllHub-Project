import "server-only";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { sendOrRelease } from "@/core/claim";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { activeOwnerOf } from "@/core/db/users";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { savingsAccounts, savingsDividendNotices, savingsHoldings } from "../data/schema";
import { taipeiToday, type DateKey } from "../lib/dates";
import { dividendNotice, dueDividendNotices, heldDividends, heldShares, type DividendEvent, type DividendNotice, type HeldDividend, type HeldShares } from "../lib/dividends";
import { fetchDividends } from "./dividends";

// 排程沒有人在等 比頁面的 8 秒久一點
const CRON_TIMEOUT_MS = 15_000;

// service 不能 import 模組根目錄的 info 與 web 的網址 寫在這裡
const MODULE_ID = "savings";
const PAGE = "/savings/investments";
const RELEASE_LOG = { module: "savings", what: "放掉除權息通知的認領失敗" };

type NoticeRow = typeof savingsDividendNotices.$inferSelect;
type Tally = { sent: number; failed: number };

const rowKey = (userId: string, symbol: string, exDate: DateKey) => `${userId} ${symbol} ${exDate}`;

/** 擁有者沒停用的人 算進來的持股照頁面同一個 heldShares 篩 照使用者分組 */
async function heldSharesByUser(): Promise<Map<string, HeldShares[]>> {
  const accounts = await db()
    .select({ userId: savingsAccounts.userId, id: savingsAccounts.id, kind: savingsAccounts.kind, active: savingsAccounts.active })
    .from(savingsAccounts)
    .innerJoin(coreUsers, activeOwnerOf(savingsAccounts.userId, "savings"));
  const holdings = await db()
    .select({ userId: savingsHoldings.userId, accountId: savingsHoldings.accountId, symbol: savingsHoldings.symbol, name: savingsHoldings.name, shares: savingsHoldings.shares })
    .from(savingsHoldings)
    .innerJoin(coreUsers, activeOwnerOf(savingsHoldings.userId, "savings"))
    .orderBy(asc(savingsHoldings.userId), asc(savingsHoldings.id));
  const accountsOf = Map.groupBy(accounts, (account) => account.userId);
  const byUser = new Map<string, HeldShares[]>();
  for (const [userId, rows] of Map.groupBy(holdings, (holding) => holding.userId)) {
    const held = heldShares(accountsOf.get(userId) ?? [], rows);
    if (held.length > 0) byUser.set(userId, held);
  }
  return byUser;
}

/**
 * 條件式寫入認領這一則 同時跑的排程只有一個寫得進去 沒認領到回 null
 * 認領到回放掉的做法 新的那一列刪掉 或把記號改回原本的
 */
async function claim(userId: string, held: HeldDividend, row: NoticeRow | undefined, notices: DividendNotice[]): Promise<(() => Promise<unknown>) | null> {
  const table = savingsDividendNotices;
  // 最後買進日那則有金額時會一起寫出 也算寄過金額
  const next = { amountNotified: (row?.amountNotified ?? false) || held.event.cashPerShare !== null, reminded: (row?.reminded ?? false) || notices.includes("last_buy") };
  if (!row) {
    const [inserted] = await db().insert(table).values({ userId, symbol: held.symbol, exDate: held.event.exDate, ...next }).onConflictDoNothing().returning({ id: table.id });
    return inserted ? () => db().delete(table).where(eq(table.id, inserted.id)) : null;
  }
  const [updated] = await db()
    .update(table)
    .set(next)
    .where(and(eq(table.id, row.id), eq(table.amountNotified, row.amountNotified), eq(table.reminded, row.reminded)))
    .returning({ id: table.id });
  if (!updated) return null;
  return () =>
    db()
      .update(table)
      .set({ amountNotified: row.amountNotified, reminded: row.reminded })
      .where(and(eq(table.id, row.id), eq(table.amountNotified, next.amountNotified), eq(table.reminded, next.reminded)));
}

/** 一個人的持股逐檔寄 同一檔同一天碰上好幾種時併成一則 */
async function noticeUser(userId: string, holdings: HeldShares[], events: DividendEvent[], rows: Map<string, NoticeRow>, today: DateKey, tally: Tally): Promise<void> {
  // 通知照新到舊排 除息日最近的最後寄 最急的才會在最上面
  for (const held of heldDividends(events, holdings, today).toReversed()) {
    const row = rows.get(rowKey(userId, held.symbol, held.event.exDate));
    const notices = dueDividendNotices(held.event, row ?? null, today);
    if (notices.length === 0) continue;
    try {
      const release = await claim(userId, held, row, notices);
      if (release === null) continue;
      const { kind, title } = dividendNotice(notices, held);
      await sendOrRelease(() => notify({ recipients: [userId], module: MODULE_ID, kind, title, url: PAGE }), release, RELEASE_LOG);
      tally.sent++;
    } catch (error) {
      tally.failed++;
      // 只記錯誤種類與 id 不記代號與名稱
      logError("savings", "除權息通知寄不出去", error, ...(row ? [row.id] : []));
    }
  }
}

/** 摘要只有數字 不寫代號 名稱與使用者 */
function summary({ sent, failed, unreadable }: Tally & { unreadable: number }): string {
  const parts = [sent > 0 && `寄出 ${sent} 則除權息通知`, failed > 0 && `${failed} 則寄不出去（詳見伺服器 log）`, unreadable > 0 && `${unreadable} 個來源讀不到`].filter(
    (part): part is string => typeof part === "string",
  );
  return parts.length > 0 ? parts.join("，") : "今天沒有要寄的除權息通知";
}

async function noticeHeldDividends(today: DateKey, fetchImpl?: typeof fetch): Promise<string> {
  const holdings = await heldSharesByUser();
  if (holdings.size === 0) return "沒有持股，不讀除權息預告";
  const fetched = await fetchDividends({ timeoutMs: CRON_TIMEOUT_MS, fetchImpl });
  if (!fetched.ok) return "讀不到除權息預告，今天略過";

  const sent = await db()
    .select()
    .from(savingsDividendNotices)
    .where(inArray(savingsDividendNotices.userId, [...holdings.keys()]));
  const rows = new Map(sent.map((row) => [rowKey(row.userId, row.symbol, row.exDate), row]));
  const tally: Tally = { sent: 0, failed: 0 };
  for (const [userId, shares] of holdings) await noticeUser(userId, shares, fetched.events, rows, today, tally);
  return summary({ ...tally, unreadable: fetched.complete ? 0 : 1 });
}

/** 除息日過了的紀錄用不到了 清不掉也不影響寄送 */
async function removePastNotices(today: DateKey): Promise<boolean> {
  try {
    await db().delete(savingsDividendNotices).where(lt(savingsDividendNotices.exDate, today));
    return true;
  } catch (error) {
    logError("savings", "清理過期的除權息通知紀錄失敗", error);
    return false;
  }
}

/**
 * 排程 savings:dividends 台北早上開盤前跑 持股公布除息日 補上配息金額 最後買進日各寄一次
 * 停用的使用者與停用的證券帳戶不算 預告表每次都讀最新的 不走快取
 */
export async function sendDividendNotices(now = new Date(), fetchImpl?: typeof fetch): Promise<string> {
  const today = taipeiToday(now);
  const cleaned = await removePastNotices(today);
  const result = await noticeHeldDividends(today, fetchImpl);
  return cleaned ? result : `${result}，清理過期的紀錄失敗（詳見伺服器 log）`;
}
