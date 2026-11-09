import { fail, ok, type Parsed } from "@/core/parsed";
import { isBusCity, isBusLine } from "./bus";
import { isMetroSystem, isMode, type Mode } from "./modes";

/** 每人最多幾條 追蹤中的每條都會用掉免費額度 */
export const ROUTE_LIMIT = 12;
export const TRACKED_LIMIT = 3;

// 車站代碼會放進 TDX 的網址 只收英數
const STATION_ID = /^[A-Za-z0-9-]{1,20}$/;
export const isStationId = (value: string) => STATION_ID.test(value);

export type RouteInput = { mode: Mode; system: string; line: string; originId: string; destinationId: string };

// 公車的迄站欄位放方向 0 是去程 1 是返程
const BUS_DIRECTION = /^\d{1,3}$/;
// 只用來對時刻表的車次 不會放進網址
const TRAIN_NO = /^[A-Za-z0-9]{1,8}$/;

export function parseRoute({ mode, system, line, originId, destinationId }: Record<"mode" | "system" | "line" | "originId" | "destinationId", string>): Parsed<RouteInput> {
  if (!isMode(mode)) return fail("請選擇交通工具");
  if (mode === "bus") {
    if (!isBusCity(system)) return fail("請選擇縣市");
    if (!isBusLine(line)) return fail("請輸入公車路線");
    if (!isStationId(originId) || !BUS_DIRECTION.test(destinationId)) return fail("請選擇站牌");
    return ok({ mode, system, line, originId, destinationId });
  }
  if (mode === "metro" && !isMetroSystem(system)) return fail("請選擇捷運系統");
  if (!isStationId(originId) || !isStationId(destinationId)) return fail("請選擇起訖站");
  if (originId === destinationId) return fail("起站跟迄站不能一樣");
  if (mode === "metro") return ok({ mode, system, line: "", originId, destinationId });
  if (!line) return fail("請從查詢結果選一班車");
  if (!TRAIN_NO.test(line)) return fail("車次不正確，請從查詢結果選一班車");
  return ok({ mode, system: "", line, originId, destinationId });
}
