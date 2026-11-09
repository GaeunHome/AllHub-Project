import { asArray, asRecord, numberOf, text } from "@/core/json";
import { clockMinutes, serviceWeekday } from "./clock";

// 市區公車 欄位照 TDX 的 OpenAPI 文件 還沒用真實金鑰驗證

export const BUS_CITIES = {
  Taipei: "臺北市",
  NewTaipei: "新北市",
  Keelung: "基隆市",
  Taoyuan: "桃園市",
  Hsinchu: "新竹市",
  HsinchuCounty: "新竹縣",
  MiaoliCounty: "苗栗縣",
  Taichung: "臺中市",
  ChanghuaCounty: "彰化縣",
  NantouCounty: "南投縣",
  YunlinCounty: "雲林縣",
  Chiayi: "嘉義市",
  ChiayiCounty: "嘉義縣",
  Tainan: "臺南市",
  Kaohsiung: "高雄市",
  PingtungCounty: "屏東縣",
  YilanCounty: "宜蘭縣",
  HualienCounty: "花蓮縣",
  TaitungCounty: "臺東縣",
  PenghuCounty: "澎湖縣",
  KinmenCounty: "金門縣",
  LienchiangCounty: "連江縣",
} as const;

export const isBusCity = (value: string): value is keyof typeof BUS_CITIES => Object.hasOwn(BUS_CITIES, value);

// 路線名稱有中文 括號與連字號 引號與斜線不收 才不會改變查詢條件
const BUS_LINE = /^[\p{L}\p{N}()（）-]{1,20}$/u;
export const isBusLine = (value: string) => BUS_LINE.test(value);

export type BusStop = { id: string; name: string };
export type BusDirection = { direction: number; name: string; stops: BusStop[] };
export type BusEta = { seconds: number | null; status: string | null };
export type BusSchedule = { headway: { min: number; max: number } | null; departures: string[] };

const zhName = (value: unknown) => text(asRecord(value)?.Zh_tw);

function stopsOf(value: unknown): BusStop[] {
  const rows = asArray(value).flatMap((stop) => {
    const row = asRecord(stop);
    const id = text(row?.StopUID);
    const name = zhName(row?.StopName);
    return id && name ? [{ id, name, sequence: numberOf(row?.StopSequence) ?? 0 }] : [];
  });
  return rows.sort((a, b) => a.sequence - b.sequence).map(({ id, name }) => ({ id, name }));
}

/** 同方向有區間車時留站最多的 那是主線 */
export function parseBusRoute(json: unknown): BusDirection[] {
  const byDirection = new Map<number, BusStop[]>();
  for (const value of asArray(json)) {
    const row = asRecord(value);
    const direction = numberOf(row?.Direction);
    const stops = stopsOf(row?.Stops);
    if (direction !== null && stops.length > (byDirection.get(direction)?.length ?? 0)) byDirection.set(direction, stops);
  }
  return [...byDirection].sort(([a], [b]) => a - b).map(([direction, stops]) => ({ direction, name: stops.at(-1)!.name, stops }));
}

const STOP_STATUS: Record<number, string> = { 1: "尚未發車", 2: "交管不停靠", 3: "末班車已過", 4: "今日未營運" };

/** key 是站牌 同一站有好幾台車時取最快的 有時間就不看狀態 部分縣市尚未發車也會給預估 */
export function parseBusEta(json: unknown, direction: number): Record<string, BusEta> {
  const stops: Record<string, BusEta> = {};
  for (const value of asArray(json)) {
    const row = asRecord(value);
    const id = text(row?.StopUID);
    if (!id || numberOf(row?.Direction) !== direction) continue;
    const seconds = numberOf(row?.EstimateTime);
    const previous = stops[id];
    if (seconds !== null) {
      if (previous?.seconds === null || previous === undefined || seconds < previous.seconds) stops[id] = { seconds, status: null };
    } else if (!previous) {
      stops[id] = { seconds: null, status: STOP_STATUS[numberOf(row?.StopStatus) ?? -1] ?? null };
    }
  }
  return stops;
}

export const soonestEta = (json: unknown, stopId: string, direction: number): BusEta => parseBusEta(json, direction)[stopId] ?? { seconds: null, status: null };

const runsOn = (serviceDay: unknown, date: string) => asRecord(serviceDay)?.[serviceWeekday(date)] === 1;

/** 班次多的路線只有班距 班次少的才有班表 minutes 是現在幾點 */
export function parseBusSchedule(json: unknown, direction: number, date: string, minutes: number): BusSchedule {
  const rows = asArray(json).flatMap((value) => {
    const row = asRecord(value);
    return row && numberOf(row.Direction) === direction ? [row] : [];
  });
  const frequency = rows.flatMap((row) => asArray(row.Frequencys)).find((value) => {
    const row = asRecord(value);
    const start = clockMinutes(row?.StartTime);
    const end = clockMinutes(row?.EndTime);
    return start !== null && end !== null && start <= minutes && minutes < end && runsOn(row?.ServiceDay, date);
  });
  const min = numberOf(asRecord(frequency)?.MinHeadwayMins);
  const max = numberOf(asRecord(frequency)?.MaxHeadwayMins);
  const departures = rows
    .flatMap((row) => asArray(row.Timetables))
    .flatMap((value) => {
      const row = asRecord(value);
      const time = text(asRecord(asArray(row?.StopTimes)[0])?.DepartureTime);
      const at = clockMinutes(time);
      return time && at !== null && at >= minutes && runsOn(row?.ServiceDay, date) ? [time] : [];
    })
    .sort();
  return { headway: min !== null && max !== null ? { min, max } : null, departures };
}
