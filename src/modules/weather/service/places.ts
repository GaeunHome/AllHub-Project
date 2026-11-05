import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { lockUserRow } from "@/core/db/users";
import { UserError } from "@/core/form";
import { weatherPlaces, type WeatherPlace } from "../data/schema";
import { parsePlaceChoice } from "../lib/cities";

// userId 一律是登入者 表單送來的 id 只決定操作哪一筆 別人的當作不存在

export const PLACE_LIMIT = 10;

export class PlaceUserError extends UserError {
  name = "PlaceUserError";
}

export function listPlaces(userId: string): Promise<WeatherPlace[]> {
  return db().select().from(weatherPlaces).where(eq(weatherPlaces.userId, userId)).orderBy(asc(weatherPlaces.createdAt), asc(weatherPlaces.id));
}

export async function addPlace(userId: string, rawChoice: string): Promise<WeatherPlace> {
  const choice = parsePlaceChoice(rawChoice);
  if (!choice.ok) throw new PlaceUserError(choice.error);
  return db().transaction(async (tx) => {
    // 鎖住這個使用者再數 同一個人同時新增時一個一個來
    await lockUserRow(tx, userId, "no key update");
    const [{ total }] = await tx.select({ total: count() }).from(weatherPlaces).where(eq(weatherPlaces.userId, userId));
    if (total >= PLACE_LIMIT) throw new PlaceUserError(`城市已滿 ${PLACE_LIMIT} 個，請先刪除一個`);
    const [row] = await tx
      .insert(weatherPlaces)
      .values({ userId, ...choice.value })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new PlaceUserError("這個城市已經加過了");
    return row;
  });
}

export async function deletePlace(userId: string, id: number): Promise<WeatherPlace> {
  const [row] = await db()
    .delete(weatherPlaces)
    .where(and(eq(weatherPlaces.id, id), eq(weatherPlaces.userId, userId)))
    .returning();
  if (!row) throw new PlaceUserError("找不到這個城市，請重新整理頁面");
  return row;
}
