import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import { NOTIFY_DAYS, REMINDER_REPEATS, type ReminderRepeat } from "../lib/rules";

/** 每人自己的提醒與倒數 不重複的日期過了由排程刪掉 重複的 date 是第一次的日期 下一次讀的時候算 刪除帳號時一起刪 */
export const remindersItems = pgTable(
  "reminders_items",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // 台北時間的 YYYY-MM-DD
    date: date("date", { mode: "string" }).notNull(),
    // 提前幾天開始通知 null 是不通知
    notifyDaysBefore: integer("notify_days_before"),
    repeat: text("repeat").$type<ReminderRepeat>().notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 開頭是 user_id 刪除帳號的連帶刪除也用得到
    index("reminders_items_user_date_idx").on(t.userId, t.date),
    // 排程照日期找到期與過期的
    index("reminders_items_date_idx").on(t.date),
    check("reminders_items_notify_days", sql`${t.notifyDaysBefore} in (${sql.raw(NOTIFY_DAYS.join(", "))})`),
    check("reminders_items_repeat", sql`${t.repeat} in (${sql.raw(REMINDER_REPEATS.map((repeat) => `'${repeat}'`).join(", "))})`),
  ],
).enableRLS();
