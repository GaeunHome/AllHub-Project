import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { coreUsers } from "@/core/db/schema";
import { COUNTIES } from "../lib/counties";

/** 每人選一個縣市與要不要收早上的下雨通知 刪除帳號時一起刪 */
export const weatherSettings = pgTable(
  "weather_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    county: text("county").notNull(),
    rainAlert: boolean("rain_alert").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("weather_settings_county", sql`${t.county} in (${sql.raw(COUNTIES.map((county) => `'${county}'`).join(", "))})`)],
).enableRLS();
