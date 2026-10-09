import { sql, type SQLWrapper } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import { MAX_AMOUNT } from "../lib/money";

// DDL 的 check 不能帶參數，上限要直接寫進 SQL
const amountInRange = (column: SQLWrapper) => sql`${column} between 1 and ${sql.raw(String(MAX_AMOUNT))}`;

// user_id 可為 null 是為了部署空窗期的舊程式（不知道這個欄位）；新程式一律指定、只讀自己的，刪除帳號時一起刪除
const ownerColumn = () => uuid("user_id").references(() => coreUsers.id, { onDelete: "cascade" });

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: serial("id").primaryKey(),
    userId: ownerColumn(),
    name: text("name").notNull(),
    monthlyAmount: integer("monthly_amount").notNull(),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("savings_goals_monthly_amount_range", amountInRange(t.monthlyAmount)), index("savings_goals_user_id_idx").on(t.userId, t.sortOrder)],
);

// 紀錄永久保留，不設清理排程
export const savingsEntries = pgTable(
  "savings_entries",
  {
    id: serial("id").primaryKey(),
    userId: ownerColumn(),
    // 用 date 存當月 1 號：資料庫能擋掉不存在的日期，也能直接用日期比較與函式
    month: date("month", { mode: "string" }).notNull(),
    // 臨時存款沒有項目；刪除項目時改成 null，紀錄留著
    goalId: integer("goal_id").references(() => savingsGoals.id, { onDelete: "set null" }),
    // 項目名稱快照：改名時同步，項目刪除後仍看得出是哪個項目；臨時存款為 null
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
);

export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type SavingsEntry = typeof savingsEntries.$inferSelect;
