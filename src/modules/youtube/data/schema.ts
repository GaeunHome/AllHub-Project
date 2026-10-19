import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import type { GlossaryEntry } from "../lib/parse";
import type { Cue } from "../lib/subtitles/format";
import { AI_PROVIDER_IDS, DEFAULT_PROVIDER } from "../lib/subtitles/providers";

/** 頻道與 WebSub 訂閱共用 同一個頻道只訂閱一次 誰追蹤記在 youtube_follows */
export const youtubeChannels = pgTable("youtube_channels", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  title: text("title").notNull(),
  thumbnail: text("thumbnail"),
  /** hub 確認訂閱時給的租約到期時間 renew 排程會在快到期前續訂 */
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  /** pending 是等 hub 確認 subscribed 是成功 失敗或 hub 拒絕時存訂閱失敗與原因 */
  subscriptionStatus: text("subscription_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** 每人各自的追蹤名單 channel_id 跟影片表一樣是 YouTube 的頻道 id */
export const youtubeFollows = pgTable(
  "youtube_follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => youtubeChannels.channelId, { onDelete: "cascade" }),
    /** 關掉時新影片照樣記錄 只是不通知這個人 */
    notifyEnabled: boolean("notify_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // 新影片推送時要依頻道找追蹤者 主鍵第一欄是使用者 所以另外建索引
  (t) => [primaryKey({ columns: [t.userId, t.channelId] }), index("youtube_follows_channel_id_idx").on(t.channelId)],
).enableRLS();

/** yes 有人工上傳的中文字幕 no 讀得到清單但沒有 unknown 還沒檢查或被擋 */
export type ZhCaptionStatus = "yes" | "no" | "unknown";

/** 影片共用 每人看自己追蹤頻道的最新 20 支 不在任何人清單裡的由 cleanup 刪掉 */
export const youtubeVideos = pgTable("youtube_videos", {
  id: serial("id").primaryKey(),
  /** 標題或說明改了 hub 會再推一次 用 video_id 去重 */
  videoId: text("video_id").notNull().unique(),
  channelId: text("channel_id").notNull(),
  title: text("title").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  zhCaptions: text("zh_captions", { enum: ["yes", "no", "unknown"] }).notNull().default("unknown"),
  /** 很多頻道上片後才補字幕 影片清單依這個時間決定要不要再檢查 */
  zhCaptionsCheckedAt: timestamp("zh_captions_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** 每人一列 API Key 用 core/crypto 加密 畫面要顯示的前幾碼讀設定時才解開來取 */
export const youtubeSettings = pgTable("youtube_settings", {
  // 單人版固定寫 id 1 新的列從 2 開始才不會撞到
  id: integer("id").primaryKey().generatedByDefaultAsIdentity({ startWith: 2 }),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => coreUsers.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: AI_PROVIDER_IDS }).notNull().default(DEFAULT_PROVIDER),
  anthropicKey: text("anthropic_key"),
  anthropicModel: text("anthropic_model"),
  openaiKey: text("openai_key"),
  openaiModel: text("openai_model"),
  geminiKey: text("gemini_key"),
  geminiModel: text("gemini_model"),
  glossary: jsonb("glossary").$type<GlossaryEntry[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export type TranslationStatus = "queued" | "running" | "done" | "failed";
export type SourceKind = "manual" | "auto" | "upload";

/** 翻譯共用 同一支影片所有人看同一份 續翻用觀看者自己的 API Key */
export const youtubeTranslations = pgTable("youtube_translations", {
  id: serial("id").primaryKey(),
  videoId: text("video_id").notNull().unique(),
  /** 使用者可以貼任何影片網址 不一定在 youtube_videos 裡 所以自己存標題 */
  title: text("title"),
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  sourceKind: text("source_kind", { enum: ["manual", "auto", "upload"] }).notNull(),
  sourceCues: jsonb("source_cues").$type<Cue[]>().notNull(),
  /** 跟 source_cues 一樣長 還沒翻的位置是 null */
  translated: jsonb("translated").$type<(string | null)[]>().notNull(),
  batches: jsonb("batches").$type<{ start: number; end: number }[]>().notNull(),
  nextBatch: integer("next_batch").notNull().default(0),
  provider: text("provider"),
  model: text("model"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** 也是翻譯鎖的心跳 running 而且最近更新過代表有人正在翻 */
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * 翻譯鎖的 fencing token 上傳 重新翻譯 重試或被接手時換掉 舊請求就寫不回去
   * 不比 updated_at 是因為 JS Date 只到毫秒 Postgres 存到微秒
   */
  lockId: uuid("lock_id"),
  /**
   * 發起人 就是開始 上傳或重新翻譯的人
   * 只有他與站長能重新翻譯或換字幕 刪帳號時翻譯留給其他人
   */
  requestedBy: uuid("requested_by").references(() => coreUsers.id, { onDelete: "set null" }),
  /**
   * 發起時的專有名詞表快照 誰接著翻都用同一份 譯名才一致
   * null 是舊程式寫的 續翻時改用觀看者自己的
   */
  glossary: jsonb("glossary").$type<GlossaryEntry[]>(),
}).enableRLS();

/**
 * 每人保留的影片 pinned 是手動保留 false 是翻譯時自動加入 滿了先擠掉
 * video_id 不連影片表 影片被清掉也找得回來 標題與頻道名是保留時的快照
 */
export const youtubeSavedVideos = pgTable(
  "youtube_saved_videos",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    title: text("title"),
    channelTitle: text("channel_title"),
    pinned: boolean("pinned").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // 清單依保留時間排 滿了要找最舊的自動項目
  (t) => [primaryKey({ columns: [t.userId, t.videoId] }), index("youtube_saved_videos_user_updated_at_idx").on(t.userId, t.updatedAt)],
).enableRLS();

export type YoutubeChannel = typeof youtubeChannels.$inferSelect;
export type YoutubeTranslation = typeof youtubeTranslations.$inferSelect;

/** 使用者追蹤的頻道 頻道表的欄位加上這個人在 youtube_follows 的通知開關 */
export type FollowedChannel = YoutubeChannel & Pick<typeof youtubeFollows.$inferSelect, "notifyEnabled">;
