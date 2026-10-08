import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** 一個遊戲角色一列；同一個 HoYoLAB 帳號底下有多個角色時，各自一列、cookie 相同 */
export const starrailAccounts = pgTable("starrail_accounts", {
  id: serial("id").primaryKey(),
  ltuid: text("ltuid").notNull(),
  cookieEncrypted: text("cookie_encrypted").notNull(),
  uid: text("uid").notNull().unique(),
  nickname: text("nickname"),
  region: text("region").notNull(),
  level: integer("level"),
  /** null 表示用預設值（上限 − 20） */
  staminaAlertThreshold: integer("stamina_alert_threshold"),
  /** 有值代表這一輪「快滿」已經通知過；開拓力降回門檻以下時清空 */
  lastStaminaAlertAt: timestamp("last_stamina_alert_at", { withTimezone: true }),
  cookieInvalid: boolean("cookie_invalid").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const starrailCheckinLogs = pgTable("starrail_checkin_logs", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id")
    .notNull()
    .references(() => starrailAccounts.id, { onDelete: "cascade" }),
  /** success／already／failed */
  result: text("result").notNull(),
  message: text("message"),
  totalSignDay: integer("total_sign_day"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StarrailAccount = typeof starrailAccounts.$inferSelect;
