import { sql, type SQLWrapper } from "drizzle-orm";
import { boolean, check, date, doublePrecision, index, integer, pgTable, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import { EXPENSE_CATEGORIES, SPLIT_MODES, type ExpenseCategory, type SplitMode } from "../lib/expenses";
import type { ItemKind } from "../lib/rules";

const oneOf = (column: SQLWrapper, values: readonly string[]) => sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;

/**
 * 成員都能改 所以沒有 user_id 權限看 travel_members
 * join_generation 加一 舊的群組連結就失效
 */
export const travelTrips = pgTable(
  "travel_trips",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    destination: text("destination"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    joinOpen: boolean("join_open").notNull().default(false),
    joinGeneration: integer("join_generation").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("travel_trips_dates", sql`${t.endDate} >= ${t.startDate}`), index("travel_trips_end_date_idx").on(t.endDate)],
).enableRLS();

/** 最早加入的人管理成員與連結 就是建立的人 他離開後自動交給下一位 所以不用角色欄位 */
export const travelMembers = pgTable(
  "travel_members",
  {
    tripId: integer("trip_id")
      .notNull()
      .references(() => travelTrips.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId] }), index("travel_members_user_id_idx").on(t.userId)],
).enableRLS();

/** day 是 null 時在想去的點 還沒排進行程 時間不存 由順序與分鐘數算出來 */
export const travelItems = pgTable(
  "travel_items",
  {
    id: serial("id").primaryKey(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => travelTrips.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }),
    position: integer("position").notNull(),
    kind: text("kind").$type<ItemKind>().notNull(),
    title: text("title").notNull(),
    mapsUrl: text("maps_url"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    note: text("note"),
    stayMinutes: integer("stay_minutes").notNull(),
    travelMinutes: integer("travel_minutes").notNull(),
    /** HH:mm 例如訂位或搭車 沒有固定時間是 null */
    fixedTime: text("fixed_time"),
    /** 存檔時比對 別人先改過就請他看過最新內容 不會默默蓋掉 */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("travel_items_trip_day_idx").on(t.tripId, t.day, t.position)],
).enableRLS();

export const travelComments = pgTable(
  "travel_comments",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => travelItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("travel_comments_item_id_idx").on(t.itemId), index("travel_comments_user_id_idx").on(t.userId)],
).enableRLS();

/** 出發前清單 大家共用 */
export const travelChecks = pgTable(
  "travel_checks",
  {
    id: serial("id").primaryKey(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => travelTrips.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("travel_checks_trip_id_idx").on(t.tripId)],
).enableRLS();

/**
 * 金額是外幣的分 rate_micros 是匯率乘一百萬 台幣是 1000000
 * 台幣不存 由這兩個算 改匯率時才對得起來
 */
export const travelExpenses = pgTable(
  "travel_expenses",
  {
    id: serial("id").primaryKey(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => travelTrips.id, { onDelete: "cascade" }),
    paidBy: uuid("paid_by")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    rateMicros: integer("rate_micros").notNull(),
    // v0.2.10 以前記的帳沒有日期與類別 類別 null 算其他
    spentOn: date("spent_on", { mode: "string" }),
    category: text("category").$type<ExpenseCategory>(),
    // 只決定表單怎麼顯示 怎麼分看每個人的 weight
    split: text("split").$type<SplitMode>().notNull().default("even"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("travel_expenses_trip_id_idx").on(t.tripId),
    index("travel_expenses_paid_by_idx").on(t.paidBy),
    check("travel_expenses_amount", sql`${t.amountCents} > 0`),
    check("travel_expenses_rate", sql`${t.rateMicros} > 0`),
    check("travel_expenses_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("travel_expenses_category", sql`${t.category} is null or ${oneOf(t.category, Object.keys(EXPENSE_CATEGORIES))}`),
    check("travel_expenses_split", oneOf(t.split, Object.keys(SPLIT_MODES))),
  ],
).enableRLS();

/** 這筆由哪些人平分 */
export const travelExpenseShares = pgTable(
  "travel_expense_shares",
  {
    expenseId: integer("expense_id")
      .notNull()
      .references(() => travelExpenses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    // 平分是 null 照比例是份數 照金額是外幣的分
    weight: integer("weight"),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.userId] }), index("travel_expense_shares_user_id_idx").on(t.userId), check("travel_expense_shares_weight", sql`${t.weight} is null or ${t.weight} > 0`)],
).enableRLS();

/**
 * 好幾個人一起付的一筆 每人刷的外幣金額 一個人付時沒有列 看 paid_by
 * paid_by 寫付最多的人 舊程式讀得懂 那個人刪除帳號時整筆跟著刪
 */
export const travelExpensePayers = pgTable(
  "travel_expense_payers",
  {
    expenseId: integer("expense_id")
      .notNull()
      .references(() => travelExpenses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.userId] }), index("travel_expense_payers_user_id_idx").on(t.userId), check("travel_expense_payers_amount", sql`${t.amountCents} > 0`)],
).enableRLS();

/** 已結清的一筆 記下誰給誰多少台幣 之後新增的帳才算得對 刪掉這一列就是復原 */
export const travelSettlements = pgTable(
  "travel_settlements",
  {
    id: serial("id").primaryKey(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => travelTrips.id, { onDelete: "cascade" }),
    fromUser: uuid("from_user")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    toUser: uuid("to_user")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    amountTwd: integer("amount_twd").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("travel_settlements_trip_id_idx").on(t.tripId),
    index("travel_settlements_from_user_idx").on(t.fromUser),
    index("travel_settlements_to_user_idx").on(t.toUser),
    check("travel_settlements_amount", sql`${t.amountTwd} > 0`),
    check("travel_settlements_people", sql`${t.fromUser} <> ${t.toUser}`),
  ],
).enableRLS();
