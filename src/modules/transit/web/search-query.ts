import { DAY_MS, isRealDateKey } from "@/core/time";
import { isBusCity, isBusLine } from "../lib/bus";
import { isMetroSystem, isMode, type Mode } from "../lib/modes";
import { isStationId } from "../lib/rules";

// 查詢的條件都在網址上 重新整理與上一頁都留著 別的值當作沒選

/** 台鐵的每日時刻表只有近 60 天 高鐵更短 */
export const MAX_DAYS_AHEAD = 60;

/** system 是捷運系統或公車的縣市 line 與 direction 只有公車用 */
export type SearchQuery = { mode: Mode; system: string; line: string; direction: number; from: string; to: string; date: string };

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
const station = (value: string | string[] | undefined) => (isStationId(one(value)) ? one(value) : "");

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
  return {
    mode: shown,
    system: shown === "bus" ? (isBusCity(system) ? system : "Taipei") : isMetroSystem(system) ? system : "TRTC",
    line: isBusLine(line) ? line : "",
    direction: one(params.dir) === "1" ? 1 : 0,
    from: station(params.from),
    to: station(params.to),
    date: dateFrom(one(params.date), today),
  };
}

export function searchHref({ mode, system, line, direction, from, to, date }: SearchQuery): string {
  if (mode === "bus") return `/transit?${new URLSearchParams({ mode, system, ...(line ? { line } : {}), ...(direction ? { dir: String(direction) } : {}) })}`;
  const query = new URLSearchParams({ mode, ...(mode === "metro" ? { system } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(mode === "metro" ? {} : { date }) });
  return `/transit?${query}`;
}

/** 起訖都選了才查 不然每動一個欄位就用掉一次額度 */
export const canSearch = ({ mode, line, from, to }: Pick<SearchQuery, "mode" | "line" | "from" | "to">) => (mode === "bus" ? line !== "" : from !== "" && to !== "" && from !== to);
