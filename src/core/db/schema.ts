import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

// account CLI 用純 node 直接載入這個檔案，只能 import 套件，不能用 @/ 或省略副檔名的相對路徑

/** 登入帳號；只能用 npm run account 建立，網站沒有註冊頁 */
export const coreUsers = pgTable(
  "core_users",
  {
    // 用 UUID 而不是流水號：資料庫重建後新帳號不會撞到舊 cookie 裡的 id
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull().unique(),
    /** scrypt$N$r$p$salt$hash，參數記在字串裡，之後調整參數舊雜湊仍能驗證 */
    passwordHash: text("password_hash").notNull(),
    /** 改密碼時遞增；session cookie 帶的版本不符就失效，其他裝置因此登出 */
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // 與 core/auth/credentials.ts 的帳號規則相同；程式漏檢查時資料庫也會擋
  (t) => [check("core_users_username_format", sql`${t.username} ~ '^[a-z0-9_.-]{3,32}$'`)],
);

/** 網站內通知；只保留 RETENTION_DAYS 天，排程 notifications:cleanup 刪除更舊的 */
export const coreNotifications = pgTable(
  "core_notifications",
  {
    id: serial("id").primaryKey(),
    /** 發出通知的模組 id（twitch、youtube…），通知頁依此篩選、導覽列依此標未讀數 */
    module: text("module").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** https 網址或站內路徑；其他格式在寫入時就丟掉 */
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("core_notifications_created_at_idx").on(t.createdAt),
    // 每 10 秒輪詢一次未讀數，只索引未讀的列
    index("core_notifications_unread_idx").on(t.module).where(sql`${t.readAt} is null`),
  ],
);

export type CoreNotification = typeof coreNotifications.$inferSelect;
