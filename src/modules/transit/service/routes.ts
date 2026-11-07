import "server-only";
import { and, count, eq, max } from "drizzle-orm";
import { db } from "@/core/db";
import { moveOwnRow, ownOrder } from "@/core/db/reorder";
import { lockUserRow } from "@/core/db/users";
import { transitRoutes, type TransitRoute } from "../data/schema";
import { ROUTE_LIMIT, TRACKED_LIMIT, parseRoute } from "../lib/rules";
import { RouteNotFoundError, TransitUserError } from "./errors";
import { readBusRoute, readDirections, readStations } from "./timetable";

// userId 一律是登入者 表單送來的 id 只決定操作哪一筆 別人的當作不存在

export type RouteFields = Record<"mode" | "system" | "line" | "originId" | "destinationId", string>;

export function listRoutes(userId: string): Promise<TransitRoute[]> {
  return db().select().from(transitRoutes).where(eq(transitRoutes.userId, userId)).orderBy(...ownOrder(transitRoutes));
}

/** 站牌名稱與方向只信 TDX 查到的 */
async function busNames(city: string, line: string, stopId: string, direction: string) {
  const route = await readBusRoute(city, line);
  if (!route.ok) throw new TransitUserError("路線資料暫時無法讀取，請稍後再試");
  const found = route.data.find((candidate) => String(candidate.direction) === direction);
  const originName = found?.stops.find((stop) => stop.id === stopId)?.name;
  if (!found || !originName) throw new TransitUserError("這條路線沒有這個站牌，請重新選擇");
  return { originName, destinationName: found.name };
}

/** 車站名稱只信 TDX 查到的 表單送來的代碼查不到就不收 */
async function stationNames(mode: Exclude<TransitRoute["mode"], "bus">, system: string, originId: string, destinationId: string) {
  const stations = await readStations(mode, system);
  if (!stations.ok) throw new TransitUserError("車站資料暫時無法讀取，請稍後再試");
  const originName = stations.data.find((station) => station.id === originId)?.name;
  if (!originName) throw new TransitUserError("找不到這個車站，請重新選擇");
  if (mode !== "metro") {
    const destinationName = stations.data.find((station) => station.id === destinationId)?.name;
    if (!destinationName) throw new TransitUserError("找不到這個車站，請重新選擇");
    return { originName, destinationName };
  }
  const directions = await readDirections(system, originId);
  if (!directions.ok) throw new TransitUserError("車站資料暫時無法讀取，請稍後再試");
  const destinationName = directions.data.find((direction) => direction.id === destinationId)?.name;
  if (!destinationName) throw new TransitUserError("這一站沒有這個方向，請重新選擇");
  return { originName, destinationName };
}

export async function addRoute(userId: string, fields: RouteFields): Promise<TransitRoute> {
  const parsed = parseRoute(fields);
  if (!parsed.ok) throw new TransitUserError(parsed.error);
  const { mode, system, line, originId, destinationId } = parsed.value;
  const names = mode === "bus" ? await busNames(system, line, originId, destinationId) : await stationNames(mode, system, originId, destinationId);
  return db().transaction(async (tx) => {
    // 鎖住這個使用者再數 同一個人同時新增時一個一個來
    await lockUserRow(tx, userId, "no key update");
    const [{ total, last }] = await tx.select({ total: count(), last: max(transitRoutes.sortOrder) }).from(transitRoutes).where(eq(transitRoutes.userId, userId));
    if (total >= ROUTE_LIMIT) throw new TransitUserError(`常用路線已滿 ${ROUTE_LIMIT} 條，請先刪除一條`);
    const [row] = await tx
      .insert(transitRoutes)
      .values({ userId, mode, system, line, originId, destinationId, ...names, sortOrder: (last ?? -1) + 1 })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new TransitUserError("這條路線已經在常用路線裡了");
    return row;
  });
}

export async function deleteRoute(userId: string, id: number): Promise<TransitRoute> {
  const [row] = await db()
    .delete(transitRoutes)
    .where(and(eq(transitRoutes.id, id), eq(transitRoutes.userId, userId)))
    .returning();
  if (!row) throw new RouteNotFoundError();
  return row;
}

/** 放到 beforeId 前面 null 是放最後 放回原位回 false 不用讓快取失效 */
export function moveRoute(userId: string, id: number, beforeId: number | null): Promise<boolean> {
  return moveOwnRow(db(), transitRoutes, { userId, id, beforeId }, () => new RouteNotFoundError());
}

/** 追蹤中的路線開車前會問即時資料 用掉免費額度 所以有上限 */
export async function setTracked(userId: string, id: number, tracked: boolean): Promise<TransitRoute> {
  return db().transaction(async (tx) => {
    await lockUserRow(tx, userId, "no key update");
    if (tracked) {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(transitRoutes)
        .where(and(eq(transitRoutes.userId, userId), eq(transitRoutes.tracked, true)));
      if (total >= TRACKED_LIMIT) throw new TransitUserError(`最多追蹤 ${TRACKED_LIMIT} 條路線，請先取消一條`);
    }
    const [row] = await tx
      .update(transitRoutes)
      .set({ tracked })
      .where(and(eq(transitRoutes.id, id), eq(transitRoutes.userId, userId)))
      .returning();
    if (!row) throw new RouteNotFoundError();
    return row;
  });
}
