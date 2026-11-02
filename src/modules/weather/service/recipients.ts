import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { activeOwnerOf } from "@/core/db/users";
import { weatherSettings } from "../data/schema";
import { normalizeCounty, type County } from "../lib/counties";

/** 開著某一種通知 帳號也沒停用的人 照縣市分組 alert 是那種通知的開關欄位 */
export async function recipientsByCounty(alert: "rainAlert" | "warningAlert"): Promise<Map<County, string[]>> {
  const rows = await db()
    .select({ userId: weatherSettings.userId, county: weatherSettings.county })
    .from(weatherSettings)
    .innerJoin(coreUsers, activeOwnerOf(weatherSettings.userId))
    .where(eq(weatherSettings[alert], true));
  const groups = new Map<County, string[]>();
  for (const row of rows) {
    const county = normalizeCounty(row.county);
    if (county) groups.set(county, [...(groups.get(county) ?? []), row.userId]);
  }
  return groups;
}
