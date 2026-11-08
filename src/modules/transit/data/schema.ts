import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import { MODES } from "../lib/modes";

/**
 * system 高鐵與台鐵是空字串 唯一索引才擋得住重複
 * 捷運的 destination 是終點站 公車的是方向 line 見 lib/modes.ts
 */
export const transitRoutes = pgTable(
  "transit_routes",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: MODES }).notNull(),
    system: text("system").notNull().default(""),
    line: text("line").notNull().default(""),
    originId: text("origin_id").notNull(),
    originName: text("origin_name").notNull(),
    destinationId: text("destination_id").notNull(),
    destinationName: text("destination_name").notNull(),
    tracked: boolean("tracked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // 使用者要的 側邊欄可以拖曳排順序 一樣時照加入的順序
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    check("transit_routes_mode", sql`${t.mode} in ('thsr', 'tra', 'metro', 'bus')`),
    uniqueIndex("transit_routes_user_route").on(t.userId, t.mode, t.system, t.line, t.originId, t.destinationId),
  ],
).enableRLS();

export type TransitRoute = typeof transitRoutes.$inferSelect;
