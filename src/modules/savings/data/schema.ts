import { sql, type SQLWrapper } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, date, index, integer, pgTable, serial, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import { ACCOUNT_KINDS, CATEGORY_KINDS, ENTRY_KINDS, PALETTE, TRANSACTION_KINDS, type AccountKind, type CategoryKind, type EntryKind, type PaletteColor, type TransactionKind } from "../lib/kinds";
import { MAX_AMOUNT } from "../lib/money";

// DDL 的 check 不能帶參數 上限與可用的值要直接寫進 SQL
const MAX = sql.raw(String(MAX_AMOUNT));
const amountInRange = (column: SQLWrapper) => sql`${column} between 1 and ${MAX}`;
const oneOf = (column: SQLWrapper, values: readonly string[]) => sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;

// 新表沒有部署空窗期的舊程式 擁有者一律必填 刪除帳號時一起刪
const owner = () =>
  uuid("user_id")
    .notNull()
    .references(() => coreUsers.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** 用途是帳戶拿來做什麼 例如生活費 資產圓餅圖依它分組 */
export const savingsPurposes = pgTable(
  "savings_purposes",
  {
    id: serial("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    color: text("color").$type<PaletteColor>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("savings_purposes_user_name_idx").on(t.userId, t.name), check("savings_purposes_color", oneOf(t.color, PALETTE))],
).enableRLS();

/** 收入與支出的分類 只有支出能設預算 */
export const savingsCategories = pgTable(
  "savings_categories",
  {
    id: serial("id").primaryKey(),
    userId: owner(),
    kind: text("kind").$type<CategoryKind>().notNull(),
    name: text("name").notNull(),
    color: text("color").$type<PaletteColor>().notNull(),
    monthlyBudget: integer("monthly_budget"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("savings_categories_user_kind_name_idx").on(t.userId, t.kind, t.name),
    check("savings_categories_kind", oneOf(t.kind, CATEGORY_KINDS)),
    check("savings_categories_color", oneOf(t.color, PALETTE)),
    check("savings_categories_budget", sql`${t.monthlyBudget} is null or (${t.kind} = 'expense' and ${t.monthlyBudget} between 1 and ${MAX})`),
  ],
).enableRLS();

/** 只存自己取的名稱與金額 不存帳號與卡號 信用卡的餘額是負的欠款 */
export const savingsAccounts = pgTable(
  "savings_accounts",
  {
    id: serial("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    kind: text("kind").$type<AccountKind>().notNull(),
    purposeId: integer("purpose_id").references(() => savingsPurposes.id, { onDelete: "set null" }),
    // 開始記帳前就有的錢 信用卡存成負的未繳金額
    openingBalance: integer("opening_balance").notNull().default(0),
    // 投資帳戶開始記帳時的成本 之後轉進轉出加減在它上面 null 是跟起始市值一樣
    openingCost: integer("opening_cost"),
    monthlyPlan: integer("monthly_plan"),
    targetAmount: integer("target_amount"),
    dueDay: smallint("due_day"),
    payFromAccountId: integer("pay_from_account_id").references((): AnyPgColumn => savingsAccounts.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("savings_accounts_user_name_idx").on(t.userId, t.name),
    index("savings_accounts_purpose_id_idx").on(t.purposeId),
    index("savings_accounts_pay_from_account_id_idx").on(t.payFromAccountId),
    check("savings_accounts_kind", oneOf(t.kind, ACCOUNT_KINDS)),
    check("savings_accounts_opening_balance", sql`${t.openingBalance} between -${MAX} and ${MAX}`),
    check("savings_accounts_opening_cost", sql`${t.openingCost} is null or (${t.kind} = 'investment' and ${t.openingCost} between 0 and ${MAX})`),
    check("savings_accounts_monthly_plan", sql`${t.monthlyPlan} is null or (${t.kind} <> 'credit' and ${t.monthlyPlan} between 1 and ${MAX})`),
    check("savings_accounts_target_amount", sql`${t.targetAmount} is null or (${t.kind} <> 'credit' and ${t.targetAmount} between 1 and ${MAX})`),
    check("savings_accounts_due_day", sql`${t.dueDay} is null or (${t.kind} = 'credit' and ${t.dueDay} between 1 and 31)`),
    check("savings_accounts_pay_from", sql`${t.payFromAccountId} is null or (${t.kind} = 'credit' and ${t.payFromAccountId} <> ${t.id})`),
  ],
).enableRLS();

/** 固定收支 排程每月在固定日期自動記一筆 沒有那一天的月份記在月底 */
export const savingsRecurring = pgTable(
  "savings_recurring",
  {
    id: serial("id").primaryKey(),
    userId: owner(),
    kind: text("kind").$type<EntryKind>().notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => savingsAccounts.id, { onDelete: "cascade" }),
    counterAccountId: integer("counter_account_id").references(() => savingsAccounts.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => savingsCategories.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    dayOfMonth: smallint("day_of_month").notNull(),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    // 最後自動記到的月份 存當月 1 號 排程每天跑 同一個月只記一次
    lastPostedMonth: date("last_posted_month", { mode: "string" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("savings_recurring_user_id_idx").on(t.userId),
    index("savings_recurring_account_id_idx").on(t.accountId),
    index("savings_recurring_counter_account_id_idx").on(t.counterAccountId),
    index("savings_recurring_category_id_idx").on(t.categoryId),
    check("savings_recurring_kind", oneOf(t.kind, ENTRY_KINDS)),
    check("savings_recurring_amount", amountInRange(t.amount)),
    check("savings_recurring_day_of_month", sql`${t.dayOfMonth} between 1 and 31`),
    check("savings_recurring_counter", sql`(${t.kind} = 'transfer') = (${t.counterAccountId} is not null) and (${t.counterAccountId} is null or ${t.counterAccountId} <> ${t.accountId})`),
    check("savings_recurring_category", sql`${t.categoryId} is null or ${t.kind} <> 'transfer'`),
    check("savings_recurring_last_posted_first_day", sql`${t.lastPostedMonth} is null or extract(day from ${t.lastPostedMonth}) = 1`),
  ],
).enableRLS();

/** 紀錄永久保留 刪除帳戶時它的紀錄連同轉帳一起刪 就像沒有這個帳戶 */
export const savingsTransactions = pgTable(
  "savings_transactions",
  {
    id: serial("id").primaryKey(),
    userId: owner(),
    kind: text("kind").$type<TransactionKind>().notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => savingsAccounts.id, { onDelete: "cascade" }),
    // 只有轉帳有 是轉入的帳戶 account_id 是轉出的
    counterAccountId: integer("counter_account_id").references(() => savingsAccounts.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => savingsCategories.id, { onDelete: "set null" }),
    // 調整是帶正負號的差額 其他一律是正數 方向看 kind
    amount: integer("amount").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    recurringId: integer("recurring_id").references(() => savingsRecurring.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("savings_transactions_user_id_date_idx").on(t.userId, t.date),
    index("savings_transactions_account_id_idx").on(t.accountId),
    index("savings_transactions_counter_account_id_idx").on(t.counterAccountId),
    index("savings_transactions_category_id_idx").on(t.categoryId),
    index("savings_transactions_recurring_id_idx").on(t.recurringId),
    check("savings_transactions_kind", oneOf(t.kind, TRANSACTION_KINDS)),
    check("savings_transactions_amount", sql`case when ${t.kind} = 'adjust' then ${t.amount} <> 0 and ${t.amount} between -${MAX} and ${MAX} else ${t.amount} between 1 and ${MAX} end`),
    check("savings_transactions_counter", sql`(${t.kind} = 'transfer') = (${t.counterAccountId} is not null) and (${t.counterAccountId} is null or ${t.counterAccountId} <> ${t.accountId})`),
    check("savings_transactions_category", sql`${t.categoryId} is null or ${t.kind} in ('income', 'expense')`),
    check("savings_transactions_date", sql`${t.date} >= '2000-01-01'`),
  ],
).enableRLS();

export type SavingsPurpose = typeof savingsPurposes.$inferSelect;
export type SavingsCategory = typeof savingsCategories.$inferSelect;
export type SavingsAccount = typeof savingsAccounts.$inferSelect;
export type SavingsRecurring = typeof savingsRecurring.$inferSelect;
export type SavingsTransaction = typeof savingsTransactions.$inferSelect;

// 舊版存錢記帳的表 v0.1.5 起不再讀寫
// 部署空窗期舊程式還會用幾分鐘 下一版再刪

// 部署空窗期的舊程式不知道 user_id 所以可為 null 刪除帳號時一起刪
const legacyOwnerColumn = () => uuid("user_id").references(() => coreUsers.id, { onDelete: "cascade" });

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: serial("id").primaryKey(),
    userId: legacyOwnerColumn(),
    name: text("name").notNull(),
    monthlyAmount: integer("monthly_amount").notNull(),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("savings_goals_monthly_amount_range", amountInRange(t.monthlyAmount)), index("savings_goals_user_id_idx").on(t.userId, t.sortOrder)],
).enableRLS();

export const savingsEntries = pgTable(
  "savings_entries",
  {
    id: serial("id").primaryKey(),
    userId: legacyOwnerColumn(),
    month: date("month", { mode: "string" }).notNull(),
    goalId: integer("goal_id").references(() => savingsGoals.id, { onDelete: "set null" }),
    goalName: text("goal_name"),
    amount: integer("amount").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("savings_entries_month_idx").on(t.month),
    index("savings_entries_goal_id_idx").on(t.goalId),
    index("savings_entries_user_id_idx").on(t.userId, t.month),
    check("savings_entries_amount_range", amountInRange(t.amount)),
    check("savings_entries_month_first_day", sql`extract(day from ${t.month}) = 1`),
    check("savings_entries_goal_name_snapshot", sql`${t.goalId} is null or ${t.goalName} is not null`),
  ],
).enableRLS();
