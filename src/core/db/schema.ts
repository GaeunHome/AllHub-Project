import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

// account CLI 用純 node 直接載入這個檔案，只能 import 套件，不能用 @/ 或省略副檔名的相對路徑

/** owner 是站長（管理頁、邀請），member 是用邀請連結註冊的成員；權限一律讀資料庫，cookie 不帶角色 */
export const USER_ROLES = ["owner", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** 登入帳號；第一個（站長）用 npm run account 建立，其他人只能用站長的邀請連結註冊 */
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
    // 預設 member：上線時舊程式建立的帳號不會意外變成站長；migration 另外把既有帳號設成 owner
    role: text("role", { enum: USER_ROLES }).notNull().default("member"),
    /** 站長停用的時間；有值就不能登入，舊 cookie 也由 requireSession 擋下 */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    /** 從上次登入成功起連續錯幾次；每 5 次鎖一段時間，計數放資料庫，多個執行個體才看得到同一個數字 */
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // 與 core/auth/credentials.ts 的帳號規則相同；程式漏檢查時資料庫也會擋
  (t) => [
    check("core_users_username_format", sql`${t.username} ~ '^[a-z0-9_.-]{3,32}$'`),
    check("core_users_role_valid", sql`${t.role} in ('owner', 'member')`),
    check("core_users_failed_logins_non_negative", sql`${t.failedLogins} >= 0`),
  ],
);

/** 邀請連結；只存邀請碼的 sha256，原文只在建立當下顯示一次，資料庫外洩也拿不到可用的連結 */
export const coreInvites = pgTable(
  "core_invites",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    // 建立者被刪除時邀請一起刪掉，還沒用完的連結也就跟著失效
    createdBy: uuid("created_by")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxUses: integer("max_uses").notNull(),
    usedCount: integer("used_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** 站長自己看的備註（例如給誰），不會顯示在註冊頁 */
    note: text("note"),
  },
  (t) => [
    // 已用次數由條件式 update 加一；這裡再擋一次，程式漏檢查時也不會超過上限
    check("core_invites_used_count_range", sql`${t.usedCount} between 0 and ${t.maxUses}`),
    check("core_invites_max_uses_range", sql`${t.maxUses} between 1 and 100`),
    check("core_invites_note_length", sql`char_length(${t.note}) <= 50`),
    index("core_invites_created_by_idx").on(t.createdBy),
  ],
);

/** 註冊與邀請碼的嘗試次數（固定時間窗），以及用過的驗證碼 nonce；Vercel 是 serverless，記憶體不共用，所以存資料庫。key 都是雜湊，不存原本的 IP 或 nonce */
export const coreRateLimits = pgTable(
  "core_rate_limits",
  {
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.keyHash] }), index("core_rate_limits_window_started_at_idx").on(t.windowStartedAt)],
);

/** 網站內通知；只保留 RETENTION_DAYS 天，排程 notifications:cleanup 刪除更舊的 */
export const coreNotifications = pgTable(
  "core_notifications",
  {
    id: serial("id").primaryKey(),
    /** 收件人；可為 null 是為了部署空窗期的舊程式（不知道這個欄位），新程式一律指定、也只讀自己的 */
    userId: uuid("user_id").references(() => coreUsers.id, { onDelete: "cascade" }),
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
    // 多人化後每次讀取都先依收件人篩選；上面兩個舊索引留到舊程式不再上線後再刪
    index("core_notifications_user_created_at_idx").on(t.userId, t.createdAt),
    index("core_notifications_user_unread_idx").on(t.userId, t.module).where(sql`${t.readAt} is null`),
  ],
);

export type CoreNotification = typeof coreNotifications.$inferSelect;
