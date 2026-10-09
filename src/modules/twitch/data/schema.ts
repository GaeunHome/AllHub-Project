import { boolean, index, integer, pgTable, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";

/** 主播與 EventSub 訂閱是共用的：同一位主播只訂閱一次，誰追蹤記在 twitch_follows */
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
  /** 單人版的通知開關，已改用 twitch_follows 的；舊程式在部署空窗期還會讀寫，等它不再上線後再刪 */
  notifyEnabled: boolean("notify_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 每個使用者各自的追蹤名單；刪除帳號時一起刪除，主播沒有人追蹤時由排程 sync 清掉 */
export const twitchFollows = pgTable(
  "twitch_follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    streamerId: integer("streamer_id")
      .notNull()
      .references(() => twitchStreamers.id, { onDelete: "cascade" }),
    /** 關掉時開台照樣記錄，只是不通知這個使用者 */
    notifyEnabled: boolean("notify_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // 開台時依主播找追蹤者，主鍵的第一欄是使用者，所以另外建索引
  (t) => [primaryKey({ columns: [t.userId, t.streamerId] }), index("twitch_follows_streamer_id_idx").on(t.streamerId)],
);

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
