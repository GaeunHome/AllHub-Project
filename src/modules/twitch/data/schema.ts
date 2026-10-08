import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const twitchStreamers = pgTable("twitch_streamers", {
  id: serial("id").primaryKey(),
  broadcasterId: text("broadcaster_id").notNull().unique(),
  login: text("login").notNull(),
  displayName: text("display_name").notNull(),
  profileImageUrl: text("profile_image_url"),
  onlineSubscriptionId: text("online_subscription_id"),
  offlineSubscriptionId: text("offline_subscription_id"),
  /** Twitch 的訂閱狀態（enabled、webhook_callback_verification_pending…），或「訂閱失敗：原因」 */
  subscriptionStatus: text("subscription_status"),
  isLive: boolean("is_live").notNull().default(false),
  /** 關掉時開台照樣記錄，只是不建立網站通知 */
  notifyEnabled: boolean("notify_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const twitchStreamEvents = pgTable("twitch_stream_events", {
  id: serial("id").primaryKey(),
  /** Twitch 可能重送同一則通知，用 message id 去重 */
  messageId: text("message_id").notNull().unique(),
  broadcasterId: text("broadcaster_id").notNull(),
  type: text("type", { enum: ["online", "offline"] }).notNull(),
  title: text("title"),
  category: text("category"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TwitchStreamer = typeof twitchStreamers.$inferSelect;
