import { isBusCity, isBusLine } from "./bus";
import { isMetroSystem, isMode, type Mode } from "./modes";

/** 每人最多幾條 追蹤中的每條都會用掉免費額度 */
export const ROUTE_LIMIT = 12;
export const TRACKED_LIMIT = 3;

// 車站代碼會放進 TDX 的網址 只收英數
const STATION_ID = /^[A-Za-z0-9-]{1,20}$/;
export const isStationId = (value: string) => STATION_ID.test(value);

export type RouteInput = { mode: Mode; system: string; line: string; originId: string; destinationId: string };
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

// 公車的迄站欄位放方向 0 是去程 1 是返程
const BUS_DIRECTION = /^\d{1,3}$/;

export function parseRoute({ mode, system, line, originId, destinationId }: Record<"mode" | "system" | "line" | "originId" | "destinationId", string>): Parsed<RouteInput> {
  if (!isMode(mode)) return { ok: false, error: "請選擇交通工具" };
  if (mode === "bus") {
    if (!isBusCity(system)) return { ok: false, error: "請選擇縣市" };
    if (!isBusLine(line)) return { ok: false, error: "請輸入公車路線" };
    if (!isStationId(originId) || !BUS_DIRECTION.test(destinationId)) return { ok: false, error: "請選擇站牌" };
    return { ok: true, value: { mode, system, line, originId, destinationId } };
  }
  if (mode === "metro" && !isMetroSystem(system)) return { ok: false, error: "請選擇捷運系統" };
  if (!isStationId(originId) || !isStationId(destinationId)) return { ok: false, error: "請選擇起訖站" };
  if (originId === destinationId) return { ok: false, error: "起站跟迄站不能一樣" };
  return { ok: true, value: { mode, system: mode === "metro" ? system : "", line: "", originId, destinationId } };
}
