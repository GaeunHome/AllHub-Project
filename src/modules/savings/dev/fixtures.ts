import { expect } from "vitest";
import { UserError } from "@/core/form";
import type { SavingsAccount, SavingsRecurring } from "../data/schema";
import type { CardDailyFlow } from "../lib/cards";
import type { ChecklistItem } from "../lib/checklist";
import type { AccountMonthFlow } from "../lib/ledger";

// 理財測試共用的假資料 只有測試檔能 import 寫進測試資料庫的在 db-fixtures.ts

/** 帳戶的一列 欄位都齊 lib 與 web 用的帳戶形狀都是它的一部分 測試只寫要看的欄位 */
export function accountRow(values: Pick<SavingsAccount, "id" | "name" | "kind"> & Partial<SavingsAccount>): SavingsAccount {
  return {
    userId: "u",
    label: null,
    cardStyle: null,
    openingBalance: 0,
    openingCost: null,
    monthlyPlan: null,
    targetAmount: null,
    dueDay: null,
    payFromAccountId: null,
    active: true,
    sortOrder: values.id,
    createdAt: new Date("2026-08-01T02:00:00Z"),
    statementDay: null,
    autopay: false,
    cardNotifiedOn: null,
    ...values,
  };
}

/** 固定收支的一列 預設是 9 月處理完 每月 20 日要確認的房租這類支出 */
export function ruleRow(values: Pick<SavingsRecurring, "id"> & Partial<SavingsRecurring>): SavingsRecurring {
  return {
    userId: "u",
    kind: "expense",
    accountId: 1,
    counterAccountId: null,
    categoryId: null,
    amount: 15000,
    dayOfMonth: 20,
    note: null,
    active: true,
    lastPostedMonth: "2026-09-01",
    createdAt: new Date("2026-08-01T02:00:00Z"),
    name: null,
    intervalMonths: 1,
    startMonth: null,
    holidayRule: "none",
    mode: "confirm",
    holdingId: null,
    allocate: false,
    lastNotifiedOn: null,
    ...values,
  };
}

/** 一個帳戶一個月的合計 沒寫的都是 0 */
export const flowRow = (accountId: number, month: string, values: Partial<AccountMonthFlow> = {}): AccountMonthFlow => ({ accountId, month, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...values });

/** 一張卡一天的合計 沒寫的都是 0 */
export const dayFlowRow = (accountId: number, date: string, values: Partial<CardDailyFlow> = {}): CardDailyFlow => ({ accountId, date, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...values });

/** 這個月要做的事的一件 預設是按不了的固定收支 */
export function checklistItem(values: Pick<ChecklistItem, "key" | "title" | "date" | "state"> & Partial<ChecklistItem>): ChecklistItem {
  return { kind: "recurring", amount: 1000, estimated: false, doneOn: null, carriedOver: false, upcoming: false, ruleId: null, cardId: null, actionable: false, cardStage: null, ...values };
}

/** 要是使用者錯誤畫面才會顯示訊息 不能是文字剛好一樣的其他錯誤 */
export async function userError(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(UserError);
  return (error as Error).message;
}
