import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { savingsAccounts, savingsCategories, savingsPurposes, savingsRecurring, savingsTransactions } from "./schema";

// 程式漏檢查時資料庫也會擋 約束跟 lib 的驗證是同一套規則

const getDb = setupTestDb();
let me: string;
let other: string;
let deposit: number;
let post: number;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
  const rows = await getDb()
    .insert(savingsAccounts)
    .values([
      { userId: me, name: "國泰", kind: "deposit" },
      { userId: me, name: "郵局", kind: "deposit" },
    ])
    .returning();
  [deposit, post] = rows.map((row) => row.id);
});

/** drizzle 把資料庫錯誤包在 cause 裡 回傳錯誤文字確認是哪個約束擋下 */
async function failureOf(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    return String((error as { cause?: unknown }).cause ?? error);
  }
  return "（沒有錯誤）";
}

const transaction = (values: Partial<typeof savingsTransactions.$inferInsert>) =>
  getDb()
    .insert(savingsTransactions)
    .values({ userId: me, kind: "expense", accountId: deposit, amount: 100, date: "2026-10-01", ...values });
const account = (values: Partial<typeof savingsAccounts.$inferInsert>) =>
  getDb()
    .insert(savingsAccounts)
    .values({ userId: me, name: "新帳戶", kind: "deposit", ...values });
const rule = (values: Partial<typeof savingsRecurring.$inferInsert>) =>
  getDb()
    .insert(savingsRecurring)
    .values({ userId: me, kind: "expense", accountId: deposit, amount: 100, dayOfMonth: 6, ...values });

describe("紀錄（savings_transactions）", () => {
  it("收支與轉帳的金額是 1 元到 1 億", async () => {
    for (const amount of [0, -1, 100_000_001]) expect(await failureOf(transaction({ amount })), String(amount)).toContain("savings_transactions_amount");
    await transaction({ amount: 100_000_000 });
  });

  it("調整的金額可以是負的、不能是 0、絕對值最多 1 億", async () => {
    expect(await failureOf(transaction({ kind: "adjust", amount: 0 }))).toContain("savings_transactions_amount");
    expect(await failureOf(transaction({ kind: "adjust", amount: -100_000_001 }))).toContain("savings_transactions_amount");
    await transaction({ kind: "adjust", amount: -100_000_000 });
  });

  it("轉帳一定要有不同的轉入帳戶，其他類型不能有", async () => {
    expect(await failureOf(transaction({ kind: "transfer" }))).toContain("savings_transactions_counter");
    expect(await failureOf(transaction({ kind: "transfer", counterAccountId: deposit }))).toContain("savings_transactions_counter");
    expect(await failureOf(transaction({ kind: "income", counterAccountId: post }))).toContain("savings_transactions_counter");
    await transaction({ kind: "transfer", counterAccountId: post });
  });

  it("分類只有收入與支出能用", async () => {
    const [category] = await getDb().insert(savingsCategories).values({ userId: me, kind: "expense", name: "餐飲", color: "orange" }).returning();

    expect(await failureOf(transaction({ kind: "transfer", counterAccountId: post, categoryId: category.id }))).toContain("savings_transactions_category");
    expect(await failureOf(transaction({ kind: "adjust", categoryId: category.id }))).toContain("savings_transactions_category");
  });

  it("類型只能是四種、日期不能早於 2000 年", async () => {
    expect(await failureOf(transaction({ kind: "refund" as "expense" }))).toContain("savings_transactions_kind");
    expect(await failureOf(transaction({ date: "1999-12-31" }))).toContain("savings_transactions_date");
  });
});

describe("帳戶（savings_accounts）", () => {
  it("每月規劃與目標只有存款與投資能設，金額 1 元到 1 億", async () => {
    expect(await failureOf(account({ kind: "credit", monthlyPlan: 100 }))).toContain("savings_accounts_monthly_plan");
    expect(await failureOf(account({ kind: "credit", targetAmount: 100 }))).toContain("savings_accounts_target_amount");
    expect(await failureOf(account({ monthlyPlan: 0 }))).toContain("savings_accounts_monthly_plan");
    expect(await failureOf(account({ targetAmount: 100_000_001 }))).toContain("savings_accounts_target_amount");
    await account({ kind: "investment", monthlyPlan: 100, targetAmount: 100_000_000 });
  });

  it("繳款日（1–31）與扣款帳戶只有信用卡能設，扣款帳戶不能是自己", async () => {
    expect(await failureOf(account({ dueDay: 6 }))).toContain("savings_accounts_due_day");
    expect(await failureOf(account({ kind: "credit", dueDay: 32 }))).toContain("savings_accounts_due_day");
    expect(await failureOf(account({ payFromAccountId: deposit }))).toContain("savings_accounts_pay_from");
    expect(await failureOf(account({ id: 1000, kind: "credit", payFromAccountId: 1000 }))).toContain("savings_accounts_pay_from");
    await account({ kind: "credit", dueDay: 31, payFromAccountId: deposit });
  });

  it("成本只有投資能設（0 到 1 億）；起始餘額在正負 1 億之間（信用卡的未繳是負的）", async () => {
    expect(await failureOf(account({ openingCost: 100 }))).toContain("savings_accounts_opening_cost");
    expect(await failureOf(account({ kind: "investment", openingCost: -1 }))).toContain("savings_accounts_opening_cost");
    expect(await failureOf(account({ openingBalance: 100_000_001 }))).toContain("savings_accounts_opening_balance");
    expect(await failureOf(account({ kind: "credit", openingBalance: -100_000_001 }))).toContain("savings_accounts_opening_balance");
    await account({ kind: "investment", openingCost: 0, openingBalance: 100_000_000 });
  });

  it("類型只能是存款、投資、信用卡", async () => {
    expect(await failureOf(account({ kind: "loan" as "deposit" }))).toContain("savings_accounts_kind");
  });
});

describe("用途與分類", () => {
  it("顏色只能是色盤裡的", async () => {
    expect(await failureOf(getDb().insert(savingsPurposes).values({ userId: me, name: "生活費", color: "pink" as "blue" }))).toContain("savings_purposes_color");
    expect(await failureOf(getDb().insert(savingsCategories).values({ userId: me, kind: "expense", name: "餐飲", color: "pink" as "blue" }))).toContain("savings_categories_color");
  });

  it("預算只有支出能設，1 元到 1 億", async () => {
    const category = (values: Partial<typeof savingsCategories.$inferInsert>) =>
      getDb()
        .insert(savingsCategories)
        .values({ userId: me, kind: "expense", name: "分類", color: "blue", ...values });

    expect(await failureOf(category({ kind: "income", monthlyBudget: 100 }))).toContain("savings_categories_budget");
    expect(await failureOf(category({ monthlyBudget: 0 }))).toContain("savings_categories_budget");
    expect(await failureOf(category({ kind: "transfer" as "expense" }))).toContain("savings_categories_kind");
    await category({ monthlyBudget: 100_000_000 });
  });
});

describe("名稱：同一個人不能重複（分類是同一類裡），別人的不算", () => {
  it("帳戶、用途、分類", async () => {
    expect(await failureOf(account({ name: "國泰", kind: "credit" }))).toContain("savings_accounts_user_name_idx");
    await account({ name: "國泰", userId: other });

    await getDb().insert(savingsPurposes).values({ userId: me, name: "生活費", color: "blue" });
    expect(await failureOf(getDb().insert(savingsPurposes).values({ userId: me, name: "生活費", color: "rose" }))).toContain("savings_purposes_user_name_idx");
    await getDb().insert(savingsPurposes).values({ userId: other, name: "生活費", color: "blue" });

    await getDb().insert(savingsCategories).values({ userId: me, kind: "expense", name: "其他", color: "slate" });
    expect(await failureOf(getDb().insert(savingsCategories).values({ userId: me, kind: "expense", name: "其他", color: "blue" }))).toContain("savings_categories_user_kind_name_idx");
    await getDb().insert(savingsCategories).values({ userId: me, kind: "income", name: "其他", color: "slate" });
  });
});

describe("固定收支（savings_recurring）", () => {
  it("金額 1 元到 1 億、每月的日期 1–31", async () => {
    expect(await failureOf(rule({ amount: 0 }))).toContain("savings_recurring_amount");
    expect(await failureOf(rule({ dayOfMonth: 0 }))).toContain("savings_recurring_day_of_month");
    expect(await failureOf(rule({ dayOfMonth: 32 }))).toContain("savings_recurring_day_of_month");
  });

  it("轉帳一定要有不同的轉入帳戶、不能有分類；不能是調整", async () => {
    const [category] = await getDb().insert(savingsCategories).values({ userId: me, kind: "expense", name: "訂閱", color: "violet" }).returning();

    expect(await failureOf(rule({ kind: "transfer" }))).toContain("savings_recurring_counter");
    expect(await failureOf(rule({ kind: "transfer", counterAccountId: deposit }))).toContain("savings_recurring_counter");
    expect(await failureOf(rule({ counterAccountId: post }))).toContain("savings_recurring_counter");
    expect(await failureOf(rule({ kind: "transfer", counterAccountId: post, categoryId: category.id }))).toContain("savings_recurring_category");
    expect(await failureOf(rule({ kind: "adjust" as "expense" }))).toContain("savings_recurring_kind");
  });

  it("記到的月份一定是那個月的 1 號", async () => {
    expect(await failureOf(rule({ lastPostedMonth: "2026-10-06" }))).toContain("savings_recurring_last_posted_first_day");
    await rule({ lastPostedMonth: "2026-10-01" });
  });
});
