import "server-only";
import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import { valueOrThrow } from "@/core/parsed";
import { externalFetch } from "@/core/external-url";
import { logError } from "@/core/errors";
import { travelItems } from "../data/schema";
import { isFullMapsUrl, isShortMapsUrl, parseMapsUrl, type MapsPlace } from "../lib/maps";
import { ITEM_LIMIT, parseItem, type ItemValues } from "../lib/rules";
import { inMemberTrip } from "./access";
import { TravelUserError } from "./errors";

export type ItemInput = { kind: string; title: string; mapsUrl: string; note: string; stayMinutes: string; travelMinutes: string; fixedTime: string };

const REDIRECT_TIMEOUT_MS = 5_000;

/** 短網址向 Google 問一次轉到哪裡 不是地圖或問不到就只留連結 名稱手動填 */
async function expandShortUrl(url: string): Promise<string> {
  try {
    const response = await externalFetch(url, { redirect: "manual" }, { timeoutMs: REDIRECT_TIMEOUT_MS });
    const location = response.headers.get("location");
    return location && isFullMapsUrl(location) ? location : url;
  } catch (error) {
    logError("travel", "展開地圖短網址失敗", error);
    return url;
  }
}

async function placeFromUrl(url: string): Promise<MapsPlace | null> {
  return parseMapsUrl(isShortMapsUrl(url) ? await expandShortUrl(url) : url);
}

/** 只貼連結就能新增 名稱從連結讀 讀不到才要使用者自己填 */
async function valuesOf(input: ItemInput): Promise<ItemValues & Pick<MapsPlace, "lat" | "lng">> {
  const mapsUrl = input.mapsUrl.trim();
  valueOrThrow(parseItem({ ...input, title: input.title.trim() || "待定" }), TravelUserError);
  const place = mapsUrl ? await placeFromUrl(mapsUrl) : null;
  const title = input.title.trim() || place?.name;
  if (!title) throw new TravelUserError("連結看不出地點名稱，請自己填名稱");
  const values = valueOrThrow(parseItem({ ...input, title }), TravelUserError);
  return { ...values, mapsUrl: place?.url ?? values.mapsUrl, lat: place?.lat ?? null, lng: place?.lng ?? null };
}

const inList = (tripId: number, day: string | null) => and(eq(travelItems.tripId, tripId), day === null ? isNull(travelItems.day) : eq(travelItems.day, day));

/** 不在行程日期裡的日子當成想去的點 */
const dayIn = (day: string | null, trip: { startDate: string; endDate: string }) => (day !== null && day >= trip.startDate && day <= trip.endDate ? day : null);

export async function addItem(userId: string, tripId: number, day: string | null, input: ItemInput): Promise<{ title: string }> {
  const values = await valuesOf(input);
  return inMemberTrip(userId, tripId, async (tx, trip) => {
    const [{ items }] = await tx.select({ items: count() }).from(travelItems).where(eq(travelItems.tripId, tripId));
    if (items >= ITEM_LIMIT) throw new TravelUserError(`一趟旅程最多 ${ITEM_LIMIT} 個項目`);
    const target = dayIn(day, trip);
    const [{ last }] = await tx.select({ last: sql<number>`coalesce(max(${travelItems.position}), -1)` }).from(travelItems).where(inList(tripId, target));
    await tx.insert(travelItems).values({ ...values, tripId, day: target, position: Number(last) + 1 });
    return { title: values.title };
  });
}

/** 比對版本 兩個人同時改同一項時 後存的人要先看過最新內容 */
export async function updateItem(userId: string, tripId: number, itemId: number, version: number, input: ItemInput): Promise<{ title: string }> {
  const values = await valuesOf(input);
  return inMemberTrip(userId, tripId, async (tx) => {
    const updated = await tx
      .update(travelItems)
      .set({ ...values, version: sql`${travelItems.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(travelItems.id, itemId), eq(travelItems.tripId, tripId), eq(travelItems.version, version)))
      .returning({ id: travelItems.id });
    if (updated.length > 0) return { title: values.title };
    const [exists] = await tx
      .select({ id: travelItems.id })
      .from(travelItems)
      .where(and(eq(travelItems.id, itemId), eq(travelItems.tripId, tripId)));
    throw new TravelUserError(exists ? "這一項剛被別人改過，請重新整理看過最新內容再改" : "找不到這一項，可能已經被刪除");
  });
}

export async function deleteItem(userId: string, tripId: number, itemId: number): Promise<{ title: string }> {
  return inMemberTrip(userId, tripId, async (tx) => {
    const [row] = await tx
      .delete(travelItems)
      .where(and(eq(travelItems.id, itemId), eq(travelItems.tripId, tripId)))
      .returning({ title: travelItems.title });
    if (!row) throw new TravelUserError("找不到這一項，可能已經被刪除");
    return row;
  });
}

/**
 * 傳放到哪一項前面 兩個人同時拖也不會互相蓋掉
 * 順序不是內容 不動 version 才不會被說成衝突
 */
export async function moveItem(userId: string, tripId: number, itemId: number, toDay: string | null, beforeId: number | null): Promise<boolean> {
  return inMemberTrip(userId, tripId, async (tx, trip) => {
    const [item] = await tx
      .select({ id: travelItems.id, day: travelItems.day })
      .from(travelItems)
      .where(and(eq(travelItems.id, itemId), eq(travelItems.tripId, tripId)));
    if (!item) throw new TravelUserError("找不到這一項，可能已經被刪除");
    const target = dayIn(toDay, trip);
    const rows = await tx
      .select({ id: travelItems.id })
      .from(travelItems)
      .where(and(inList(tripId, target), ne(travelItems.id, itemId)))
      .orderBy(asc(travelItems.position), asc(travelItems.id));
    const others = rows.map((row) => row.id);
    const index = beforeId === null ? -1 : others.indexOf(beforeId);
    const at = index === -1 ? others.length : index;
    if (item.day === target) {
      const current = await tx.select({ id: travelItems.id }).from(travelItems).where(inList(tripId, target)).orderBy(asc(travelItems.position), asc(travelItems.id));
      if (current.findIndex((row) => row.id === itemId) === at) return false;
    }
    const ids = others.toSpliced(at, 0, itemId);
    await tx.update(travelItems).set({ day: target }).where(eq(travelItems.id, itemId));
    for (const [position, id] of ids.entries()) await tx.update(travelItems).set({ position }).where(eq(travelItems.id, id));
    return true;
  });
}

