import "server-only";
import { and, asc, eq, getTableColumns, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { logError } from "@/core/errors";
import { notify } from "@/core/notify";
import { savingsAccounts, savingsCategories, savingsHoldings, savingsRecurring, type SavingsRecurring } from "../data/schema";
import { CARD_FLOW_DAYS, cardBill } from "../lib/cards";
import { addDays, daysBetween, formatSlashDate, type DateKey } from "../lib/dates";
import { accountBalances } from "../lib/ledger";
import { formatTwd } from "../lib/money";
import { pendingOccurrences, recurringTitle } from "../lib/recurring";
import { listAccounts } from "./accounts";
import { cardDailyFlows, listCardBills } from "./cards";
import { accountMonthFlows } from "./transactions";

// 排程 savings:recurring 寄的到期通知 只寄給擁有者 停用的使用者凍結不寄
// 用 last_notified_on 與 card_notified_on 條件式 update 認領 同一天只寄一次

// service 不能 import 模組根目錄的 info 模組 id 寫在這裡
const MODULE_ID = "savings";
const PAGE = "/savings";
// 信用卡在截止前幾天提醒
const CARD_NOTICE_DAYS = 3;

export type NoticeResult = { sent: number; failed: number };

const accountIdsOf = (rule: Pick<SavingsRecurring, "accountId" | "counterAccountId">) => (rule.counterAccountId === null ? [rule.accountId] : [rule.accountId, rule.counterAccountId]);

/** 寄出失敗時把認領退回去 明天的排程或重送時還能再寄 */
async function sendClaimed(send: () => Promise<void>, revert: () => Promise<unknown>): Promise<void> {
  try {
    await send();
  } catch (error) {
    await revert();
    throw error;
  }
}

/** 名稱跟待處理一樣 從擁有者自己的帳戶 分類與持股找 */
async function ruleTitle(rule: SavingsRecurring, accountNames: Map<number, string>): Promise<string> {
  const [categories, holdings] = await Promise.all([
    rule.categoryId === null ? [] : db().select({ id: savingsCategories.id, name: savingsCategories.name }).from(savingsCategories).where(and(eq(savingsCategories.id, rule.categoryId), eq(savingsCategories.userId, rule.userId))),
    rule.holdingId === null ? [] : db().select({ id: savingsHoldings.id, symbol: savingsHoldings.symbol }).from(savingsHoldings).where(and(eq(savingsHoldings.id, rule.holdingId), eq(savingsHoldings.userId, rule.userId))),
  ]);
  return recurringTitle(rule, {
    accounts: accountNames,
    categories: new Map(categories.map((category) => [category.id, category.name])),
    holdingSymbols: new Map(holdings.map((holding) => [holding.id, holding.symbol])),
  });
}

/** 某一期的日期是今天才寄 帳戶停用的不寄 待處理也不會列 */
async function noticeRule(rule: SavingsRecurring, today: DateKey): Promise<boolean> {
  const ids = accountIdsOf(rule);
  const accounts = await db()
    .select({ id: savingsAccounts.id, name: savingsAccounts.name, active: savingsAccounts.active })
    .from(savingsAccounts)
    .where(and(eq(savingsAccounts.userId, rule.userId), inArray(savingsAccounts.id, ids)));
  if (accounts.length !== ids.length || accounts.some((account) => !account.active)) return false;

  const claimed = await db()
    .update(savingsRecurring)
    .set({ lastNotifiedOn: today })
    .where(and(eq(savingsRecurring.id, rule.id), or(isNull(savingsRecurring.lastNotifiedOn), lt(savingsRecurring.lastNotifiedOn, today))))
    .returning({ id: savingsRecurring.id });
  if (claimed.length === 0) return false;

  // 薪水每月不一樣 提醒填實際的金額
  const title = rule.allocate ? "今天發薪：記得確認實際金額" : `今天到期：${await ruleTitle(rule, new Map(accounts.map((account) => [account.id, account.name])))} ${formatTwd(rule.amount)}`;
  await sendClaimed(
    () => notify({ recipients: [rule.userId], module: MODULE_ID, kind: "recurring_due", title, url: PAGE }),
    () => db().update(savingsRecurring).set({ lastNotifiedOn: rule.lastNotifiedOn }).where(and(eq(savingsRecurring.id, rule.id), eq(savingsRecurring.lastNotifiedOn, today))),
  );
  return true;
}

type NotifiableCard = { id: number; userId: string; name: string; statementDay: number | null; dueDay: number | null; autopay: boolean; cardNotifiedOn: string | null };

/** 一個人的卡一起算 餘額要看全部紀錄 帳單只看近 70 天 */
async function noticeCards(userId: string, cards: NotifiableCard[], today: DateKey, result: NoticeResult): Promise<void> {
  const [accounts, flows, daily, statements] = await Promise.all([listAccounts(userId), accountMonthFlows(userId), cardDailyFlows(userId, addDays(today, -CARD_FLOW_DAYS)), listCardBills(userId)]);
  const balances = accountBalances(accounts, flows);
  for (const card of cards) {
    try {
      const bill = cardBill(card, balances.get(card.id)?.balance ?? 0, daily, today, statements);
      if (bill.dueDate === null || daysBetween(today, bill.dueDate) !== CARD_NOTICE_DAYS || (!bill.needsBill && bill.remainingDue <= 0)) continue;
      const claimed = await db()
        .update(savingsAccounts)
        .set({ cardNotifiedOn: today })
        .where(and(eq(savingsAccounts.id, card.id), or(isNull(savingsAccounts.cardNotifiedOn), lt(savingsAccounts.cardNotifiedOn, today))))
        .returning({ id: savingsAccounts.id });
      if (claimed.length === 0) continue;
      const due = `${card.name} ${formatSlashDate(bill.dueDate)}`;
      // 還沒填帳單時不知道銀行要扣多少 先提醒填帳單
      const title = bill.needsBill
        ? `${due} 截止：記得填帳單並確認繳款`
        : card.autopay
          ? `${due} 自動扣繳：本期 ${formatTwd(bill.remainingDue)}，記得確認`
          : `${due} 截止：本期應繳 ${formatTwd(bill.remainingDue)}`;
      await sendClaimed(
        () => notify({ recipients: [userId], module: MODULE_ID, kind: "card_due", title, url: PAGE }),
        () => db().update(savingsAccounts).set({ cardNotifiedOn: card.cardNotifiedOn }).where(and(eq(savingsAccounts.id, card.id), eq(savingsAccounts.cardNotifiedOn, today))),
      );
      result.sent++;
    } catch (error) {
      result.failed++;
      logError("savings", "信用卡截止通知失敗", error, card.id);
    }
  }
}

/** 要確認的固定收支今天到期 信用卡 3 天後截止而且還沒填帳單或還沒繳清 */
export async function sendDueNotices(today: DateKey): Promise<NoticeResult> {
  const result: NoticeResult = { sent: 0, failed: 0 };
  const rules = await db()
    .select(getTableColumns(savingsRecurring))
    .from(savingsRecurring)
    .innerJoin(coreUsers, and(eq(coreUsers.id, savingsRecurring.userId), isNull(coreUsers.disabledAt)))
    .where(and(eq(savingsRecurring.mode, "confirm"), eq(savingsRecurring.active, true)))
    .orderBy(asc(savingsRecurring.id));
  for (const rule of rules) {
    if (!pendingOccurrences(rule, today).some((occurrence) => occurrence.date === today)) continue;
    try {
      if (await noticeRule(rule, today)) result.sent++;
    } catch (error) {
      result.failed++;
      // 只記錯誤種類與 id 不記名稱與金額
      logError("savings", "固定收支到期通知失敗", error, rule.id);
    }
  }

  const cards = await db()
    .select({
      id: savingsAccounts.id,
      userId: savingsAccounts.userId,
      name: savingsAccounts.name,
      statementDay: savingsAccounts.statementDay,
      dueDay: savingsAccounts.dueDay,
      autopay: savingsAccounts.autopay,
      cardNotifiedOn: savingsAccounts.cardNotifiedOn,
    })
    .from(savingsAccounts)
    .innerJoin(coreUsers, and(eq(coreUsers.id, savingsAccounts.userId), isNull(coreUsers.disabledAt)))
    .where(and(eq(savingsAccounts.kind, "credit"), eq(savingsAccounts.active, true), isNotNull(savingsAccounts.dueDay)))
    .orderBy(asc(savingsAccounts.userId), asc(savingsAccounts.id));
  const byUser = Map.groupBy(cards, (card) => card.userId);
  for (const [userId, userCards] of byUser) {
    try {
      await noticeCards(userId, userCards, today, result);
    } catch (error) {
      result.failed += userCards.length;
      logError("savings", "信用卡截止通知失敗", error, ...userCards.map((card) => card.id));
    }
  }
  return result;
}
