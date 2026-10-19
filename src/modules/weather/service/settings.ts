import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { weatherSettings } from "../data/schema";
import { normalizeCounty, type County } from "../lib/counties";
import { WeatherUserError } from "./errors";

// userId 一律是登入者 每人只有自己的一列

export type WeatherSettings = { county: County; rainAlert: boolean };

/** 還沒選過縣市是 null */
export async function getSettings(userId: string): Promise<WeatherSettings | null> {
  const [row] = await db().select({ county: weatherSettings.county, rainAlert: weatherSettings.rainAlert }).from(weatherSettings).where(eq(weatherSettings.userId, userId));
  const county = row ? normalizeCounty(row.county) : null;
  return row && county ? { county, rainAlert: row.rainAlert } : null;
}

export async function saveSettings(userId: string, { county: value, rainAlert }: { county: string; rainAlert: boolean }): Promise<County> {
  const county = normalizeCounty(value);
  if (county === null) throw new WeatherUserError("請從清單選一個縣市");
  await db()
    .insert(weatherSettings)
    .values({ userId, county, rainAlert })
    .onConflictDoUpdate({ target: weatherSettings.userId, set: { county, rainAlert, updatedAt: sql`now()` } });
  return county;
}
