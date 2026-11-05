import "server-only";
import { DAY_MS, taipeiDateKey } from "@/core/time";
import { upcoming } from "../lib/countdown";
import type { Departure } from "../lib/timetable";
import type { TransitRoute } from "../data/schema";
import { cachedDepartures, cachedLive } from "../service/cached";

// 交給倒數卡片的資料 倒數在瀏覽器算 伺服器只給時刻表

/** status 是公車沒有車時的說明 例如末班車已過 */
export type RouteBoard = { route: TransitRoute; departures: Departure[]; problem: string | null; status: string | null };

/** 今天快沒車了才讀明天 不然每條路線一天多用一次額度 */
const MIN_UPCOMING = 3;

/** 公車沒有固定時刻 用目前的預估當作下一班 */
async function busBoard(route: TransitRoute): Promise<RouteBoard> {
  const live = await cachedLive(route.mode, route.system, route.line, route.originId, route.destinationId);
  if (!live.ok) return { route, departures: [], problem: live.problem, status: null };
  if (live.data.kind !== "estimate" || live.data.seconds === null) return { route, departures: [], problem: null, status: live.data.kind === "estimate" ? (live.data.status ?? null) : null };
  return { route, departures: [{ at: live.data.readAt + live.data.seconds * 1000, arrivesAt: null, trainNo: null, kind: null, toward: route.destinationName }], problem: null, status: null };
}

async function boardOf(route: TransitRoute, now: Date): Promise<RouteBoard> {
  const { mode } = route;
  if (mode === "bus") return busBoard(route);
  const read = (date: string) => cachedDepartures(mode, route.system, route.originId, route.destinationId, date);
  const today = await read(taipeiDateKey(now));
  if (!today.ok) return { route, departures: [], problem: today.problem, status: null };
  if (upcoming(today.data, now.getTime()).length >= MIN_UPCOMING) return { route, departures: today.data, problem: null, status: null };
  const tomorrow = await read(taipeiDateKey(new Date(now.getTime() + DAY_MS)));
  return { route, departures: tomorrow.ok ? [...today.data, ...tomorrow.data] : today.data, problem: null, status: null };
}

export const loadBoards = (routes: TransitRoute[], now: Date) => Promise.all(routes.map((route) => boardOf(route, now)));
