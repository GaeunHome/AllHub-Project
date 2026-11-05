import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import { COUNTIES } from "../lib/counties";

/** 每人選一個縣市與要不要收早上的下雨通知 天氣警特報通知 刪除帳號時一起刪 */
export const weatherSettings = pgTable(
  "weather_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    county: text("county").notNull(),
    rainAlert: boolean("rain_alert").notNull().default(true),
    warningAlert: boolean("warning_alert").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("weather_settings_county", sql`${t.county} in (${sql.raw(COUNTIES.map((county) => `'${county}'`).join(", "))})`)],
).enableRLS();

/** 天氣頁多看的城市 首頁維持 weather_settings 的一個縣市 county 用氣象署 world 用 Open-Meteo */
export const weatherPlaces = pgTable(
  "weather_places",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["county", "world"] }).notNull(),
    name: text("name").notNull(),
    country: text("country"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    timezone: text("timezone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // 使用者拖曳的順序 一樣時照加入的順序
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [check("weather_places_kind", sql`${t.kind} in ('county', 'world')`), uniqueIndex("weather_places_user_name").on(t.userId, t.name)],
).enableRLS();

export type WeatherPlace = typeof weatherPlaces.$inferSelect;
