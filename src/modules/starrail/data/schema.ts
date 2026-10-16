import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";

/**
 * 一個遊戲角色一列 同一個 HoYoLAB 帳號的角色各一列 cookie 相同
 * UID 全站唯一 被別人連結的 UID 不能再連結
 */
export const starrailAccounts = pgTable(
  "starrail_accounts",
  {
    id: serial("id").primaryKey(),
    /**
     * 擁有者 可為 null 是為了部署空窗期的舊程式
     * 新程式不處理這些列 重新連結就會歸給連結的人
     */
    userId: uuid("user_id").references(() => coreUsers.id, { onDelete: "cascade" }),
    ltuid: text("ltuid").notNull(),
    cookieEncrypted: text("cookie_encrypted").notNull(),
    uid: text("uid").notNull().unique(),
    nickname: text("nickname"),
    region: text("region").notNull(),
    level: integer("level"),
    /** null 表示用預設值 也就是上限減 20 */
    staminaAlertThreshold: integer("stamina_alert_threshold"),
    /** 有值代表這一輪快滿已經通知過 降回門檻以下時清空 */
    lastStaminaAlertAt: timestamp("last_stamina_alert_at", { withTimezone: true }),
    cookieInvalid: boolean("cookie_invalid").notNull().default(false),
    /** 每天自動兌換社群整理的新兌換碼 使用者在帳號設定打開 */
    autoRedeem: boolean("auto_redeem").notNull().default(false),
    /** 每日實訓 每週內容與終局挑戰的提醒 使用者在帳號設定關掉 開拓力提醒另外看門檻 */
    gameReminders: boolean("game_reminders").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("starrail_accounts_user_id_idx").on(t.userId)],
).enableRLS();

export const starrailCheckinLogs = pgTable("starrail_checkin_logs", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id")
    .notNull()
    .references(() => starrailAccounts.id, { onDelete: "cascade" }),
  /** success already 或 failed */
  result: text("result").notNull(),
  message: text("message"),
  totalSignDay: integer("total_sign_day"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/**
 * 自動兌換試過的兌換碼 每個遊戲帳號一碼一列 試過的不再送出
 * 兌換碼是社群公開的 跟著帳號刪除
 */
export const starrailRedeemCodes = pgTable(
  "starrail_redeem_codes",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => starrailAccounts.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    /** 只記答案不會變的 success already expired 或 invalid 見 lib/redeem.ts */
    result: text("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("starrail_redeem_codes_account_code").on(t.accountId, t.code)],
).enableRLS();

export type StarrailAccount = typeof starrailAccounts.$inferSelect;
