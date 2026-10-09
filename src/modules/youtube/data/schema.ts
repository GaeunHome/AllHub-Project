import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import type { GlossaryEntry } from "../lib/parse";
import type { Cue } from "../lib/subtitles/format";
import { AI_PROVIDER_IDS } from "../lib/subtitles/providers";

/** 頻道與 WebSub 訂閱是共用的：同一個頻道只訂閱一次，誰追蹤記在 youtube_follows */
export const youtubeChannels = pgTable("youtube_channels", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  title: text("title").notNull(),
  thumbnail: text("thumbnail"),
  /** hub 確認訂閱時給的租約到期時間；排程 renew 會在快到期前續訂 */
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  /** pending（已送出、等 hub 確認）、subscribed、denied，或「訂閱失敗：原因」 */
  subscriptionStatus: text("subscription_status"),
  /** 單人版的通知開關，已改用 youtube_follows 的；舊程式在部署空窗期還會讀寫，等它不再上線後再刪 */
  notifyEnabled: boolean("notify_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 每個使用者各自的追蹤名單；channel_id 跟 youtube_videos 一樣是 YouTube 的頻道 id（UC…），刪除帳號時一起刪除 */
export const youtubeFollows = pgTable(
  "youtube_follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => youtubeChannels.channelId, { onDelete: "cascade" }),
    /** 關掉時新影片照樣記錄，只是不通知這個使用者 */
    notifyEnabled: boolean("notify_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // 新影片推送時依頻道找追蹤者，主鍵的第一欄是使用者，所以另外建索引
  (t) => [primaryKey({ columns: [t.userId, t.channelId] }), index("youtube_follows_channel_id_idx").on(t.channelId)],
);

/** yes：有人工上傳的中文字幕；no：讀得到字幕清單但沒有；unknown：還沒檢查或 YouTube 擋下了 */
export type ZhCaptionStatus = "yes" | "no" | "unknown";

/** 影片是共用的；每個人看到自己追蹤頻道的最新 20 支，不在任何人最新 20 支裡的由排程 cleanup 刪掉 */
export const youtubeVideos = pgTable("youtube_videos", {
  id: serial("id").primaryKey(),
  /** 影片標題或說明被修改時 hub 會再推一次，用 video_id 去重 */
  videoId: text("video_id").notNull().unique(),
  channelId: text("channel_id").notNull(),
  title: text("title").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  zhCaptions: text("zh_captions", { enum: ["yes", "no", "unknown"] }).notNull().default("unknown"),
  /** 很多頻道上片後才補字幕，影片清單會依這個時間決定要不要重新檢查 */
  zhCaptionsCheckedAt: timestamp("zh_captions_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 每個使用者一列（user_id）。API key 用 core/crypto 加密，hint 存末 4 碼給畫面顯示 */
export const youtubeSettings = pgTable("youtube_settings", {
  // 單人版固定寫 id = 1（部署空窗期的舊程式還會這樣寫），新的列從 2 開始自動編號才不會撞到
  id: integer("id").primaryKey().generatedByDefaultAsIdentity({ startWith: 2 }),
  /** 可為 null 是為了部署空窗期的舊程式；新程式只讀寫自己的那一列 */
  userId: uuid("user_id")
    .unique()
    .references(() => coreUsers.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: AI_PROVIDER_IDS }).notNull().default("anthropic"),
  anthropicKey: text("anthropic_key"),
  anthropicKeyHint: text("anthropic_key_hint"),
  anthropicModel: text("anthropic_model"),
  openaiKey: text("openai_key"),
  openaiKeyHint: text("openai_key_hint"),
  openaiModel: text("openai_model"),
  geminiKey: text("gemini_key"),
  geminiKeyHint: text("gemini_key_hint"),
  geminiModel: text("gemini_model"),
  glossary: jsonb("glossary").$type<GlossaryEntry[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TranslationStatus = "queued" | "running" | "done" | "failed";
export type SourceKind = "manual" | "auto" | "upload";

/** 翻譯是共用的：同一支影片所有人看同一份，續翻用觀看者自己的 API Key */
export const youtubeTranslations = pgTable("youtube_translations", {
  id: serial("id").primaryKey(),
  videoId: text("video_id").notNull().unique(),
  /** 不一定在 youtube_videos 裡（使用者可貼任意影片網址），所以自己存標題 */
  title: text("title"),
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  sourceKind: text("source_kind", { enum: ["manual", "auto", "upload"] }).notNull(),
  sourceCues: jsonb("source_cues").$type<Cue[]>().notNull(),
  /** 與 source_cues 等長，還沒翻的位置是 null */
  translated: jsonb("translated").$type<(string | null)[]>().notNull(),
  batches: jsonb("batches").$type<{ start: number; end: number }[]>().notNull(),
  nextBatch: integer("next_batch").notNull().default(0),
  provider: text("provider"),
  model: text("model"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** 也當作簡易鎖的心跳：running 且最近更新過，代表有人正在翻 */
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** 翻譯鎖的 fencing token：上傳、重新翻譯、重試或被接手時換掉，舊請求就寫不回去；不比 updated_at 是因為 JS Date 只到毫秒、Postgres 存到微秒 */
  lockId: uuid("lock_id"),
  /** 發起人（開始、上傳或重新翻譯的人），只有他與站長能重新翻譯或換字幕；刪除帳號時改成 null，翻譯留給其他人 */
  requestedBy: uuid("requested_by").references(() => coreUsers.id, { onDelete: "set null" }),
  /** 發起時的專有名詞表快照：誰接著翻都用同一份，譯名才會一致；null 是舊程式寫入的列，續翻時改用觀看者自己的 */
  glossary: jsonb("glossary").$type<GlossaryEntry[]>(),
});

export type YoutubeChannel = typeof youtubeChannels.$inferSelect;
export type YoutubeTranslation = typeof youtubeTranslations.$inferSelect;
