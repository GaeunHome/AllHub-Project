import { DAY_MS, isRealDateKey } from "@/core/time";
import { isBusCity, isBusLine } from "../lib/bus";
import { isMode, type Mode } from "../lib/modes";
import { isStationId } from "../lib/rules";
import type { Departure } from "../lib/timetable";

// 查詢的條件都在網址上 重新整理與上一頁都留著 別的值當作沒選

/** 台鐵的每日時刻表只有近 60 天 高鐵更短 */
export const MAX_DAYS_AHEAD = 60;

/** system line direction 只有公車用 system 是縣市 time 是出發時間 空的代表不篩選 */
export type SearchQuery = { mode: Mode; system: string; line: string; direction: number; from: string; to: string; date: string; time: string };

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
const station = (value: string | string[] | undefined) => (isStationId(one(value)) ? one(value) : "");
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function dateFrom(value: string, today: string): string {
  if (!isRealDateKey(value) || value < today) return today;
  const days = (Date.parse(value) - Date.parse(today)) / DAY_MS;
  return days > MAX_DAYS_AHEAD ? today : value;
}

export function parseSearch(params: Record<string, string | string[] | undefined>, today: string): SearchQuery {
  const mode = one(params.mode);
  const system = one(params.system);
  const line = one(params.line);
  const shown = isMode(mode) ? mode : "thsr";
  const from = station(params.from);
  const to = station(params.to);
  return {
    mode: shown,
    system: shown === "bus" ? (isBusCity(system) ? system : "Taipei") : "",
    line: isBusLine(line) ? line : "",
    direction: one(params.dir) === "1" ? 1 : 0,
    from,
    to: to === from ? "" : to,
    date: dateFrom(one(params.date), today),
    time: CLOCK.test(one(params.time)) ? one(params.time) : "",
  };
}

export function searchHref({ mode, system, line, direction, from, to, date, time }: SearchQuery): string {
  if (mode === "bus") return `/transit?${new URLSearchParams({ mode, system, ...(line ? { line } : {}), ...(direction ? { dir: String(direction) } : {}) })}`;
  const query = new URLSearchParams({ mode, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(mode === "metro" ? {} : { date, ...(time ? { time } : {}) }) });
  return `/transit?${query}`;
}

/** 關閉查詢結果 只拿掉讓它查詢的欄位 表單上選好的留著 */
export const closedHref = (query: SearchQuery) => searchHref({ ...query, to: "", line: "" });

/** 開走的不列 整天的時刻表已經讀好 時間只是篩選 不用再問 TDX */
export function trainsAfter(departures: readonly Departure[], { date, time, now }: { date: string; time: string; now: number }): Departure[] {
  const from = time ? Date.parse(`${date}T${time}:00+08:00`) : 0;
  return departures.filter((departure) => departure.at > now && departure.at >= from);
}

/** 起訖都選了才查 不然每動一個欄位就用掉一次額度 */
export const canSearch = ({ mode, line, from, to }: Pick<SearchQuery, "mode" | "line" | "from" | "to">) => (mode === "bus" ? line !== "" : from !== "" && to !== "" && from !== to);
