import { sql } from "drizzle-orm";
import { boolean, check, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import { MODES } from "../lib/modes";

/**
 * 常用路線 車站名稱是新增時向 TDX 抄下來的 畫面不用再查一次
 * 捷運沒有起訖站的時刻表 destination 是這一站開往的終點站
 * system 是捷運系統或公車的縣市 高鐵與台鐵是空字串 唯一索引才擋得住重複
 * 公車的 line 是路線 origin 是站牌 destination 的 id 是方向 name 是那個方向的終點
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
  },
  (t) => [
    check("transit_routes_mode", sql`${t.mode} in ('thsr', 'tra', 'metro', 'bus')`),
    uniqueIndex("transit_routes_user_route").on(t.userId, t.mode, t.system, t.line, t.originId, t.destinationId),
  ],
).enableRLS();

export type TransitRoute = typeof transitRoutes.$inferSelect;
