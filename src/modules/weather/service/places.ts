import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { moveOwnRow, nextOwnSlot, ownOrder } from "@/core/db/reorder";
import { UserError } from "@/core/form";
import { weatherPlaces, weatherSettings, type WeatherPlace } from "../data/schema";
import { parsePlaceChoice } from "../lib/cities";
import { PLACE_LIMIT } from "../lib/places";

// userId 一律是登入者 表單送來的 id 只決定操作哪一筆 別人的當作不存在

export class PlaceUserError extends UserError {
  name = "PlaceUserError";
}

export function listPlaces(userId: string): Promise<WeatherPlace[]> {
  return db().select().from(weatherPlaces).where(eq(weatherPlaces.userId, userId)).orderBy(...ownOrder(weatherPlaces));
}

export async function addPlace(userId: string, rawChoice: string): Promise<WeatherPlace> {
  const choice = parsePlaceChoice(rawChoice);
  if (!choice.ok) throw new PlaceUserError(choice.error);
  return db().transaction(async (tx) => {
    // 鎖住這個使用者再數 同一個人同時新增時一個一個來
    const { total, sortOrder } = await nextOwnSlot(tx, weatherPlaces, userId);
    if (total >= PLACE_LIMIT) throw new PlaceUserError(`城市已滿 ${PLACE_LIMIT} 個，請先刪除一個`);
    const [settings] = await tx.select({ county: weatherSettings.county }).from(weatherSettings).where(eq(weatherSettings.userId, userId));
    if (choice.value.kind === "county" && settings?.county === choice.value.name) throw new PlaceUserError("這是首頁的縣市，已經排在第一個了");
    const [row] = await tx
      .insert(weatherPlaces)
      .values({ userId, ...choice.value, sortOrder })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new PlaceUserError("這個城市已經加過了");
    return row;
  });
}

const NOT_FOUND = "找不到這個城市，請重新整理頁面";

/** 傳放到哪一個前面 不傳位置編號 兩個分頁同時排也不會互相蓋掉 回傳有沒有改 */
export function movePlace(userId: string, id: number, beforeId: number | null): Promise<boolean> {
  return moveOwnRow(db(), weatherPlaces, { userId, id, beforeId }, () => new PlaceUserError(NOT_FOUND));
}

export async function deletePlace(userId: string, id: number): Promise<WeatherPlace> {
  const [row] = await db()
    .delete(weatherPlaces)
    .where(and(eq(weatherPlaces.id, id), eq(weatherPlaces.userId, userId)))
    .returning();
  if (!row) throw new PlaceUserError(NOT_FOUND);
  return row;
}
