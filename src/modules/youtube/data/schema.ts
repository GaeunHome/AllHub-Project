import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { GlossaryEntry } from "../lib/parse";
import type { Cue } from "../lib/subtitles/format";
import { AI_PROVIDER_IDS } from "../lib/subtitles/providers";

export const youtubeChannels = pgTable("youtube_channels", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  title: text("title").notNull(),
  thumbnail: text("thumbnail"),
  /** hub 確認訂閱時給的租約到期時間；排程 renew 會在快到期前續訂 */
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  /** pending（已送出、等 hub 確認）、subscribed、denied，或「訂閱失敗：原因」 */
  subscriptionStatus: text("subscription_status"),
  /** 關掉時新影片照樣記錄，只是不建立網站通知 */
  notifyEnabled: boolean("notify_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** yes：有人工上傳的中文字幕；no：讀得到字幕清單但沒有；unknown：還沒檢查或 YouTube 擋下了 */
export type ZhCaptionStatus = "yes" | "no" | "unknown";

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

/** 只有一列（id = 1）。API key 用 core/crypto 加密，hint 存末 4 碼給畫面顯示 */
export const youtubeSettings = pgTable("youtube_settings", {
  id: integer("id").primaryKey(),
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
});

export type YoutubeChannel = typeof youtubeChannels.$inferSelect;
export type YoutubeTranslation = typeof youtubeTranslations.$inferSelect;
