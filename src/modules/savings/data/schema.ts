import { sql, type SQLWrapper } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, date, index, integer, pgTable, serial, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import {
  ACCOUNT_KINDS,
  CARD_STYLES,
  CATEGORY_KINDS,
  ENTRY_KINDS,
  HOLIDAY_RULES,
  INTERVAL_MONTHS,
  MAX_SHARES,
  PALETTE,
  RECURRING_MODES,
  SYMBOL_PATTERN,
  TRANSACTION_KINDS,
  type AccountKind,
  type CardStyle,
  type CategoryKind,
  type EntryKind,
  type HolidayRule,
  type PaletteColor,
  type RecurringMode,
  type TransactionKind,
} from "../lib/kinds";
import { MAX_AMOUNT } from "../lib/money";

// DDL 的 check 不能帶參數 上限與可用的值要直接寫進 SQL
const MAX = sql.raw(String(MAX_AMOUNT));
const amountInRange = (column: SQLWrapper) => sql`${column} between 1 and ${MAX}`;
const oneOf = (column: SQLWrapper, values: readonly string[]) => sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;
const firstOfMonth = (column: SQLWrapper) => sql`${column} is null or extract(day from ${column}) = 1`;

// 新表沒有部署空窗期的舊程式 擁有者一律必填 刪除帳號時一起刪
const owner = () =>
  uuid("user_id")
    .notNull()
    .references(() => coreUsers.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

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
    // 圖示名稱 見 CATEGORY_ICONS
    icon: text("icon"),
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
    // 開始記帳前就有的錢 信用卡存成負的未繳金額
    openingBalance: integer("opening_balance").notNull().default(0),
    // 投資帳戶開始記帳時的成本 之後轉進轉出加減在它上面 null 是跟起始市值一樣
    openingCost: integer("opening_cost"),
    monthlyPlan: integer("monthly_plan"),
    targetAmount: integer("target_amount"),
    // 舊的繳款截止日設定 不再修改 只當第一張帳單截止日的預設 之後的版本刪掉
    dueDay: smallint("due_day"),
    payFromAccountId: integer("pay_from_account_id").references((): AnyPgColumn => savingsAccounts.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    // 信用卡的結帳日 沒填的卡截止前才填帳單 填的那天當結帳日
    statementDay: smallint("statement_day"),
    autopay: boolean("autopay").notNull().default(false),
    // 截止前的提醒寄到哪一天 排程用條件式 update 認領 同一天只寄一次
    cardNotifiedOn: date("card_notified_on", { mode: "string" }),
    // 用途 例如生活費
    label: text("label"),
    // 信用卡的卡面顏色
    cardStyle: text("card_style").$type<CardStyle>(),
  },
  (t) => [
    uniqueIndex("savings_accounts_user_name_idx").on(t.userId, t.name),
    index("savings_accounts_pay_from_account_id_idx").on(t.payFromAccountId),
    check("savings_accounts_kind", oneOf(t.kind, ACCOUNT_KINDS)),
    check("savings_accounts_opening_balance", sql`${t.openingBalance} between -${MAX} and ${MAX}`),
    check("savings_accounts_opening_cost", sql`${t.openingCost} is null or (${t.kind} = 'investment' and ${t.openingCost} between 0 and ${MAX})`),
    check("savings_accounts_monthly_plan", sql`${t.monthlyPlan} is null or (${t.kind} <> 'credit' and ${t.monthlyPlan} between 1 and ${MAX})`),
    check("savings_accounts_target_amount", sql`${t.targetAmount} is null or (${t.kind} <> 'credit' and ${t.targetAmount} between 1 and ${MAX})`),
    check("savings_accounts_due_day", sql`${t.dueDay} is null or (${t.kind} = 'credit' and ${t.dueDay} between 1 and 31)`),
    check("savings_accounts_pay_from", sql`${t.payFromAccountId} is null or (${t.kind} = 'credit' and ${t.payFromAccountId} <> ${t.id})`),
    check("savings_accounts_statement_day", sql`${t.statementDay} is null or (${t.kind} = 'credit' and ${t.statementDay} between 1 and 31)`),
    check("savings_accounts_autopay", sql`not ${t.autopay} or ${t.kind} = 'credit'`),
    check("savings_accounts_card_style", sql`${t.cardStyle} is null or (${t.kind} = 'credit' and ${oneOf(t.cardStyle, CARD_STYLES)})`),
  ],
).enableRLS();

/** 投資帳戶裡的持股 股數與成本存目前的狀態 買賣時跟著紀錄一起改 */
export const savingsHoldings = pgTable(
  "savings_holdings",
  {
    id: serial("id").primaryKey(),
    userId: owner(),
    accountId: integer("account_id")
      .notNull()
      .references(() => savingsAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    // 建立時從股價清單抄的名稱 之後不自動改
    name: text("name").notNull(),
    shares: integer("shares").notNull(),
    // 目前的總成本 含手續費
    cost: integer("cost").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("savings_holdings_account_symbol_idx").on(t.accountId, t.symbol),
    index("savings_holdings_user_id_idx").on(t.userId),
    check("savings_holdings_symbol", sql`${t.symbol} ~ '${sql.raw(SYMBOL_PATTERN.source)}'`),
    check("savings_holdings_shares", sql`${t.shares} between 0 and ${sql.raw(String(MAX_SHARES))}`),
    check("savings_holdings_cost", sql`${t.cost} between 0 and ${MAX}`),
  ],
).enableRLS();

/** 銀行的帳單 每張卡每個結帳日一張 每張卡只留最新幾張 紀錄留著 */
export const savingsCardBills = pgTable(
  "savings_card_bills",
  {
    id: serial("id").primaryKey(),
    userId: owner(),
    accountId: integer("account_id")
      .notNull()
      .references(() => savingsAccounts.id, { onDelete: "cascade" }),
    // 沒有結帳日的卡是填帳單那天
    statementDate: date("statement_date", { mode: "string" }).notNull(),
    // 照帳單填的存 遇假日順延是讀的時候算 舊程式存的已經順延過
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amount: integer("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("savings_card_bills_account_statement_idx").on(t.accountId, t.statementDate),
    index("savings_card_bills_user_id_idx").on(t.userId),
    check("savings_card_bills_amount", sql`${t.amount} between 0 and ${MAX}`),
  ],
).enableRLS();

/**
 * 固定收支 每 interval_months 個月一期 沒有那一天的月份是月底 再照假日規則調整
 * 自動記的由排程記帳 要確認的列在待處理
 */
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
    // 已經處理到哪一期 自動記 確認或略過都算 存那一期的 1 號
    lastPostedMonth: date("last_posted_month", { mode: "string" }),
    createdAt: createdAt(),
    // 舊資料是 null 畫面退回原本的標題
    name: text("name"),
    intervalMonths: smallint("interval_months").notNull().default(1),
    // 第一期的月份 存 1 號 null 是舊資料 當成建立的那個月
    startMonth: date("start_month", { mode: "string" }),
    holidayRule: text("holiday_rule").$type<HolidayRule>().notNull().default("none"),
    // 舊資料維持自動記 新增時 service 預設要確認
    mode: text("mode").$type<RecurringMode>().notNull().default("auto"),
    // 定期定額買哪一檔 轉入的一定是它所在的投資帳戶
    holdingId: integer("holding_id").references(() => savingsHoldings.id, { onDelete: "cascade" }),
    // 薪水 確認時接著分配到各帳戶
    allocate: boolean("allocate").notNull().default(false),
    // 到期通知寄到哪一天 排程用條件式 update 認領 同一天只寄一次
    lastNotifiedOn: date("last_notified_on", { mode: "string" }),
  },
  (t) => [
    index("savings_recurring_user_id_idx").on(t.userId),
    index("savings_recurring_account_id_idx").on(t.accountId),
    index("savings_recurring_counter_account_id_idx").on(t.counterAccountId),
    index("savings_recurring_category_id_idx").on(t.categoryId),
    index("savings_recurring_holding_id_idx").on(t.holdingId),
    check("savings_recurring_kind", oneOf(t.kind, ENTRY_KINDS)),
    check("savings_recurring_amount", amountInRange(t.amount)),
    check("savings_recurring_day_of_month", sql`${t.dayOfMonth} between 1 and 31`),
    check("savings_recurring_counter", sql`(${t.kind} = 'transfer') = (${t.counterAccountId} is not null) and (${t.counterAccountId} is null or ${t.counterAccountId} <> ${t.accountId})`),
    check("savings_recurring_category", sql`${t.categoryId} is null or ${t.kind} <> 'transfer'`),
    check("savings_recurring_last_posted_first_day", firstOfMonth(t.lastPostedMonth)),
    check("savings_recurring_interval_months", sql`${t.intervalMonths} in (${sql.raw(INTERVAL_MONTHS.join(", "))})`),
    check("savings_recurring_start_month_first_day", firstOfMonth(t.startMonth)),
    check("savings_recurring_holiday_rule", oneOf(t.holidayRule, HOLIDAY_RULES)),
    check("savings_recurring_mode", oneOf(t.mode, RECURRING_MODES)),
    // 定期定額要股數 薪水要實際金額 都只能確認
    check("savings_recurring_holding", sql`${t.holdingId} is null or (${t.kind} = 'transfer' and ${t.mode} = 'confirm')`),
    check("savings_recurring_allocate", sql`not ${t.allocate} or (${t.kind} = 'income' and ${t.mode} = 'confirm')`),
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
    // 買進或賣出的那一檔 持股刪掉後紀錄留著
    holdingId: integer("holding_id").references(() => savingsHoldings.id, { onDelete: "set null" }),
    // 這筆改變的股數 買進是正的 賣出是負的
    shares: integer("shares"),
    // 這筆讓持股成本改變多少 刪除紀錄時用來還原
    costChange: integer("cost_change"),
    // 確認的是固定收支的哪一期 存那一期的 1 號
    recurringPeriod: date("recurring_period", { mode: "string" }),
    // 填帳單時補的差額 再填一次或刪掉這一筆時找得到
    cardBillId: integer("card_bill_id").references((): AnyPgColumn => savingsCardBills.id, { onDelete: "set null" }),
  },
  (t) => [
    index("savings_transactions_user_id_date_idx").on(t.userId, t.date),
    index("savings_transactions_account_id_idx").on(t.accountId),
    index("savings_transactions_counter_account_id_idx").on(t.counterAccountId),
    index("savings_transactions_category_id_idx").on(t.categoryId),
    index("savings_transactions_recurring_id_idx").on(t.recurringId),
    index("savings_transactions_holding_id_idx").on(t.holdingId),
    index("savings_transactions_card_bill_id_idx").on(t.cardBillId),
    check("savings_transactions_kind", oneOf(t.kind, TRANSACTION_KINDS)),
    check("savings_transactions_amount", sql`case when ${t.kind} = 'adjust' then ${t.amount} <> 0 and ${t.amount} between -${MAX} and ${MAX} else ${t.amount} between 1 and ${MAX} end`),
    check("savings_transactions_counter", sql`(${t.kind} = 'transfer') = (${t.counterAccountId} is not null) and (${t.counterAccountId} is null or ${t.counterAccountId} <> ${t.accountId})`),
    check("savings_transactions_category", sql`${t.categoryId} is null or ${t.kind} in ('income', 'expense')`),
    check("savings_transactions_date", sql`${t.date} >= '2000-01-01'`),
    // 不跟 holding_id 綁在一起 刪除持股時 set null 會違反
    check("savings_transactions_shares", sql`${t.shares} is null or (${t.kind} = 'transfer' and ${t.shares} <> 0)`),
    check("savings_transactions_cost_change", sql`${t.costChange} is null or ${t.costChange} between -${MAX} and ${MAX}`),
    check("savings_transactions_recurring_period_first_day", firstOfMonth(t.recurringPeriod)),
  ],
).enableRLS();

export type SavingsCategory = typeof savingsCategories.$inferSelect;
export type SavingsAccount = typeof savingsAccounts.$inferSelect;
export type SavingsHolding = typeof savingsHoldings.$inferSelect;
export type SavingsCardBill = typeof savingsCardBills.$inferSelect;
export type SavingsRecurring = typeof savingsRecurring.$inferSelect;
export type SavingsTransaction = typeof savingsTransactions.$inferSelect;
