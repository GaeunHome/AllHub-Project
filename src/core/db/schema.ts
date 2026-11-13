import { sql } from "drizzle-orm";
import { boolean, check, customType, index, integer, pgTable, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

// account CLI 用純 node 載入 只能 import 套件 不能用 @/ 或省略副檔名的路徑

// 每張表都 enableRLS 不加 policy Supabase Data API 一列都碰不到
// 網站用資料表的擁有者連線 不受影響

/** owner 是站長 member 是用邀請註冊的成員 權限一律讀資料庫 cookie 不帶角色 */
export const USER_ROLES = ["owner", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];
/** 畫面與 account CLI 顯示的角色名稱 */
export const ROLE_LABELS: Record<UserRole, string> = { owner: "站長", member: "成員" };

/** 第一個帳號是站長 用 npm run account 建立 其他人只能用邀請連結註冊 */
export const coreUsers = pgTable(
  "core_users",
  {
    // 用 UUID 不用流水號 資料庫重建後新帳號才不會撞到舊 cookie 裡的 id
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull().unique(),
    /** 顯示用的名字 沒填就顯示帳號名稱 登入一律用帳號名稱 */
    nickname: text("nickname"),
    /** 選的範例頭像 只存 id 圖是靜態檔 沒選就是文字頭像 */
    avatar: text("avatar"),
    /** scrypt$N$r$p$salt$hash 參數記在字串裡 之後調整參數舊雜湊仍能驗證 */
    passwordHash: text("password_hash").notNull(),
    /** 改密碼時遞增 cookie 帶的版本不符就失效 其他裝置因此登出 */
    sessionVersion: integer("session_version").notNull().default(1),
    // 預設 member 舊程式建立的帳號才不會變成站長 既有帳號由 migration 設成 owner
    role: text("role", { enum: USER_ROLES }).notNull().default("member"),
    /** 站長停用的時間 有值就不能登入 舊 cookie 也由 requireSession 擋下 */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    /** 上次成功後連錯幾次 每 5 次鎖一段時間 放資料庫各執行個體才看得到同一個數 */
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /** 站長在管理頁看多久沒來 每小時最多寫一次 */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // 跟 core/auth/credentials.ts 的帳號規則相同 程式漏檢查時資料庫也會擋
  (t) => [
    check("core_users_username_format", sql`${t.username} ~ '^[a-z0-9_.-]{3,32}$'`),
    check("core_users_role_valid", sql`${t.role} in ('owner', 'member')`),
    check("core_users_failed_logins_non_negative", sql`${t.failedLogins} >= 0`),
  ],
).enableRLS();

/**
 * 只記不能用的 預設全部能用 之後新增的模組自動開放
 * module_id 不設外鍵 模組清單在程式裡 沒有資料表
 */
export const coreModuleDenials = pgTable(
  "core_module_denials",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.moduleId] })],
).enableRLS();

/** 只存邀請碼的 sha256 原文只在建立時顯示一次 資料庫外洩也拿不到可用的連結 */
export const coreInvites = pgTable(
  "core_invites",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    // 建立者被刪除時邀請一起刪掉 沒用完的連結也跟著失效
    createdBy: uuid("created_by")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxUses: integer("max_uses").notNull(),
    usedCount: integer("used_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** 站長自己看的備註 例如給誰 不會顯示在註冊頁 */
    note: text("note"),
    /** 用這個連結註冊的人一開始不能用的模組 只記不能用的 跟 core_module_denials 一樣 */
    deniedModules: text("denied_modules").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [
    // 已用次數由條件式 update 加一 這裡再擋一次 程式漏檢查也不會超過上限
    check("core_invites_used_count_range", sql`${t.usedCount} between 0 and ${t.maxUses}`),
    check("core_invites_max_uses_range", sql`${t.maxUses} between 1 and 100`),
    check("core_invites_note_length", sql`char_length(${t.note}) <= 50`),
    index("core_invites_created_by_idx").on(t.createdBy),
  ],
).enableRLS();

/**
 * 嘗試次數與用過的驗證碼 nonce serverless 記憶體不共用 所以存資料庫
 * key 都是雜湊 不存原本的 IP 或 nonce
 */
export const coreRateLimits = pgTable(
  "core_rate_limits",
  {
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.keyHash] }), index("core_rate_limits_window_started_at_idx").on(t.windowStartedAt)],
).enableRLS();

/** 網站內通知 只留 RETENTION_DAYS 天 更舊的由 notifications:cleanup 排程刪除 */
export const coreNotifications = pgTable(
  "core_notifications",
  {
    id: serial("id").primaryKey(),
    /** 收件人 每個人只讀寫自己的通知 刪除帳號時一起刪 */
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    /** 發出通知的模組 id 例如 twitch 通知頁依此篩選 導覽列依此標未讀數 */
    module: text("module").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** http 或 https 網址與站內路徑 其他格式在寫入時就丟掉 */
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    // 清理排程照建立時間刪 不分收件人
    index("core_notifications_created_at_idx").on(t.createdAt),
    // 讀取都先依收件人篩選 每 10 秒輪詢一次的未讀數只索引未讀的列
    index("core_notifications_user_created_at_idx").on(t.userId, t.createdAt),
    index("core_notifications_user_unread_idx").on(t.userId, t.module).where(sql`${t.readAt} is null`),
  ],
).enableRLS();

export type CoreNotification = typeof coreNotifications.$inferSelect;

export const AUDIT_OUTCOMES = ["success", "failure"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/**
 * 操作紀錄 不放密碼 cookie API Key 這類東西
 * actor_id 不設外鍵 帳號刪掉後紀錄要留到期 所以名字也存一份
 */
export const coreAuditLogs = pgTable(
  "core_audit_logs",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 同一次操作寫出的幾列共用一個編號 */
    batchId: uuid("batch_id").notNull(),
    actorId: uuid("actor_id"),
    actorName: text("actor_name").notNull(),
    ip: text("ip").notNull(),
    /** 模組 id 帳號的事是 auth 站長的事是 admin */
    module: text("module").notNull(),
    action: text("action").notNull(),
    outcome: text("outcome", { enum: AUDIT_OUTCOMES }).notNull(),
    target: text("target"),
    detail: text("detail"),
    /** 合併的失敗登入算了幾次 其他都是 1 */
    attempts: integer("attempts").notNull().default(1),
    /** 只有合併的列才有 外人能無限觸發的事才不會一次寫一列 */
    mergeKey: text("merge_key").unique(),
  },
  (t) => [check("core_audit_logs_outcome", sql`${t.outcome} in ('success', 'failure')`), index("core_audit_logs_created_at_idx").on(t.createdAt)],
).enableRLS();

/** 每個排程一列 跑完蓋過上一次 資料量不會隨時間長大 站長的系統狀態頁看 */
export const coreCronStatus = pgTable("core_cron_status", {
  task: text("task").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  ok: boolean("ok").notNull(),
  summary: text("summary").notNull(),
}).enableRLS();

/** 每個外部服務一列 同樣只更新 lastError 只放畫面上的摘要 不放憑證與回應原文 */
export const coreServiceStatus = pgTable("core_service_status", {
  service: text("service").primaryKey(),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastError: text("last_error"),
}).enableRLS();

/** 停止服務 不停機維護 一般公告 */
export const ANNOUNCEMENT_KINDS = ["outage", "maintenance", "general"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

/** 站長在管理頁發的公告 首頁最下面列出 重要的也放在跑馬燈 ends_at 過了就不顯示 */
export const coreAnnouncements = pgTable(
  "core_announcements",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: ANNOUNCEMENT_KINDS }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** 站長勾的 一般公告也放到全站最上面的跑馬燈 */
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("core_announcements_kind", sql`${t.kind} in ('outage', 'maintenance', 'general')`),
    check("core_announcements_period", sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  ],
).enableRLS();

export type CoreAnnouncement = typeof coreAnnouncements.$inferSelect;

/** 一支手機一列 endpoint 是瀏覽器給的推播網址 同一支手機重新訂閱時蓋過去 */
export const corePushSubscriptions = pgTable(
  "core_push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("core_push_subscriptions_user_id_idx").on(t.userId)],
).enableRLS();

/** 這支手機不想收推播的模組 只記關掉的 跟 core_module_denials 一樣 */
export const corePushMutes = pgTable(
  "core_push_mutes",
  {
    endpoint: text("endpoint")
      .notNull()
      .references(() => corePushSubscriptions.endpoint, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.endpoint, t.moduleId] })],
).enableRLS();

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** 自己上傳的頭像 瀏覽器縮成小圖才送來 每人一列 換照片時舊的刪掉 id 就是網址 換了才看得到新圖 */
export const coreAvatarImages = pgTable("core_avatar_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => coreUsers.id, { onDelete: "cascade" }),
  image: bytea("image").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
