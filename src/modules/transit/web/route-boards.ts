import "server-only";
import { DAY_MS, taipeiDateKey } from "@/core/time";
import { upcoming } from "../lib/countdown";
import { trainNoOf } from "../lib/modes";
import { departuresToward, type Departure } from "../lib/timetable";
import type { TransitRoute } from "../data/schema";
import { cachedDepartures, cachedLive, cachedMetroDepartures } from "../service/cached";
import { mapRead, type Read } from "../service/timetable";

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

/** 捷運存的是開往終點的方向 中途折返的車不知道停不停得到使用者要去的站 所以不列 */
async function metroToward(route: TransitRoute, date: string): Promise<Read<Departure[]>> {
  return mapRead(await cachedMetroDepartures(route.system, route.originId, date), (all) => departuresToward(all, [route.destinationId]));
}

async function boardOf(route: TransitRoute, now: Date): Promise<RouteBoard> {
  const { mode } = route;
  if (mode === "bus") return busBoard(route);
  // 存了車次的只看那一班 以前存的路線沒有車次 照舊列整段路
  const train = trainNoOf(route);
  const shown = (departures: Departure[]) => (train ? departures.filter((departure) => departure.trainNo === train) : departures);
  const read = (date: string) => (mode === "metro" ? metroToward(route, date) : cachedDepartures(mode, route.originId, route.destinationId, date));
  const today = await read(taipeiDateKey(now));
  if (!today.ok) return { route, departures: [], problem: today.problem, status: null };
  const todays = shown(today.data);
  if (upcoming(todays, now.getTime()).length >= (train ? 1 : MIN_UPCOMING)) return { route, departures: todays, problem: null, status: null };
  const tomorrow = await read(taipeiDateKey(new Date(now.getTime() + DAY_MS)));
  // 只看一班車時讀不到明天就不知道還有沒有車 不能說成沒有這班車
  if (!tomorrow.ok && train) return { route, departures: todays, problem: tomorrow.problem, status: null };
  return { route, departures: tomorrow.ok ? [...todays, ...shown(tomorrow.data)] : todays, problem: null, status: null };
}

export const loadBoards = (routes: TransitRoute[], now: Date) => Promise.all(routes.map((route) => boardOf(route, now)));
