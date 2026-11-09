import { DAY_MS } from "@/core/time";
import { asArray, asRecord, numberOf, text } from "@/core/json";
import { clockMinutes, serviceWeekday } from "./clock";

// 欄位照 TDX 的 OpenAPI 文件 還沒用真實金鑰驗證 讀不到的那一班略過

/** at 是開車時間的毫秒時間戳 伺服器與瀏覽器算起來才會一樣 towardId 只有捷運有 */
export type Departure = { at: number; arrivesAt: number | null; trainNo: string | null; kind: string | null; toward: string | null; towardId?: string; fareKey?: FareKey };
/** 台鐵的票價表靠這兩個對到班次 同一段路兩個方向的價錢不同 */
export type FareKey = { trainType: number; direction: number };
/** city 只有台鐵的面板用 車站清單本來就帶著 分組不用多問一次 TDX */
export type Station = { id: string; name: string; city?: string };
/** 一條線上的車站代碼 照路線上的順序 */
export type MetroLine = { id: string; stationIds: string[] };

/** 跨夜車次在這個時間之前才經過起站 就是隔天的事 */
const OVERNIGHT_BEFORE_MINUTES = 180;

/** 時刻表的時間都是台灣時間 */
const stamp = (date: string, minutes: number) => Date.parse(`${date}T00:00:00+08:00`) + minutes * 60_000;

const zhName = (value: unknown) => text(asRecord(value)?.Zh_tw);

// 括號裡是車型時要寫出來 使用者要分得出自強與自強3000 只是設備說明的不寫
const TRAIN_MODELS: [mark: string, name: (base: string) => string][] = [
  ["3000", (base) => `${base}3000`],
  ["普悠瑪", () => "普悠瑪"],
  ["太魯閣", () => "太魯閣"],
];

/** 區間車 普快車的車拿掉 跟區間快才不會看起來差一個字 */
function trainKind(value: unknown): string | null {
  const name = zhName(value);
  if (!name) return null;
  const [head, detail = ""] = name.split(/[(（]/);
  const kind = head.trim();
  const base = kind.length === 3 && kind.endsWith("車") ? kind.slice(0, 2) : kind;
  const model = TRAIN_MODELS.find(([mark]) => detail.includes(mark));
  return model ? model[1](base) : base;
}

/** 高鐵沒有車種代碼 這裡也就沒有 */
function fareKeyOf(info: Record<string, unknown>): { fareKey?: FareKey } {
  const trainType = numberOf(info.TrainTypeCode);
  const direction = numberOf(info.Direction);
  return trainType === null || direction === null ? {} : { fareKey: { trainType, direction } };
}

function dailyDeparture(value: unknown, date: string): Departure[] {
  const row = asRecord(value);
  const info = asRecord(row?.DailyTrainInfo);
  const departs = clockMinutes(asRecord(row?.OriginStopTime)?.DepartureTime);
  if (!info || departs === null || numberOf(info.SuspendedFlag) === 1) return [];
  const overnight = departs < OVERNIGHT_BEFORE_MINUTES && (Boolean(text(info.OverNightStationID)) || info.Overnight === true);
  const at = stamp(date, departs) + (overnight ? DAY_MS : 0);
  const arrives = clockMinutes(asRecord(row?.DestinationStopTime)?.ArrivalTime);
  const arrivesAt = arrives === null ? null : stamp(date, arrives) + (overnight ? DAY_MS : 0);
  return [{ at, arrivesAt: arrivesAt !== null && arrivesAt < at ? arrivesAt + DAY_MS : arrivesAt, trainNo: text(info.TrainNo), kind: trainKind(info.TrainTypeName), toward: zhName(info.EndingStationName), ...fareKeyOf(info) }];
}

export function parseDailyTimetable(json: unknown, date: string): Departure[] {
  return asArray(json).flatMap((row) => dailyDeparture(row, date)).sort((a, b) => a.at - b.at);
}

/** 一個方向一天的班次 那天不開的方向是空的 */
function metroDirection(value: unknown, date: string, weekday: string): Departure[] {
  const row = asRecord(value);
  const towardId = text(row?.DestinationStaionID);
  if (!towardId || asRecord(row?.ServiceDay)?.[weekday] !== true) return [];
  const toward = zhName(row?.DestinationStationName);
  const stops = asArray(row?.Timetables).flatMap((stop) => {
    const entry = asRecord(stop);
    const minutes = clockMinutes(entry?.DepartureTime);
    return minutes === null ? [] : [{ minutes, sequence: numberOf(entry?.Sequence) ?? 0 }];
  });
  let previous = -1;
  let dayOffset = 0;
  return stops
    .sort((a, b) => a.sequence - b.sequence)
    .map(({ minutes }): Departure => {
      // 發車順序不會倒退 時間變小就是過了午夜
      if (minutes < previous) dayOffset = DAY_MS;
      previous = minutes;
      return { at: stamp(date, minutes) + dayOffset, arrivesAt: null, trainNo: null, kind: null, toward, towardId };
    });
}

/** 一站每個方向都列 往哪裡由規劃出來的路線挑 國定假日照星期算 TDX 的服務日只分星期幾 */
export function parseMetroTimetable(json: unknown, date: string): Departure[] {
  const weekday = serviceWeekday(date);
  return asArray(json)
    .flatMap((value) => metroDirection(value, date, weekday))
    .sort((a, b) => a.at - b.at);
}

/** 中途折返的車有停到要下車的站也能搭 towardIds 是路線算好的 */
export const departuresToward = (departures: readonly Departure[], towardIds: readonly string[]): Departure[] => departures.filter(({ towardId }) => towardId !== undefined && towardIds.includes(towardId));

/** 文湖線這種沒有站別時刻表的是空的 */
export function metroDirections(json: unknown): Station[] {
  const directions = new Map<string, string>();
  for (const value of asArray(json)) {
    const row = asRecord(value);
    const id = text(row?.DestinationStaionID);
    const name = zhName(row?.DestinationStationName);
    if (id && name) directions.set(id, name);
  }
  return [...directions].map(([id, name]) => ({ id, name }));
}

export function parseStations(json: unknown): Station[] {
  const stations = new Map<string, Station>();
  for (const value of asArray(json)) {
    const row = asRecord(value);
    const id = text(row?.StationID);
    const name = zhName(row?.StationName);
    const city = text(row?.LocationCity);
    if (id && name && !stations.has(id)) stations.set(id, { id, name, ...(city ? { city } : {}) });
  }
  return [...stations.values()];
}

/** 每條線的車站已經帶站名 車站清單不用另外問 同一站在兩條線上只留一個 */
export function parseLineStations(json: unknown): Station[] {
  return parseStations(asArray(json).flatMap((line) => asArray(asRecord(line)?.Stations)));
}

function stopsInOrder(value: unknown): string[] {
  const stops = asArray(value).flatMap((stop) => {
    const entry = asRecord(stop);
    const id = text(entry?.StationID);
    return id ? [{ id, sequence: numberOf(entry?.Sequence) ?? Number.MAX_SAFE_INTEGER }] : [];
  });
  return stops.sort((a, b) => a.sequence - b.sequence).map((stop) => stop.id);
}

/** 支線跟主線同一個 LineNo 但各自一條 規劃路線要知道換到支線算轉乘 */
export function parseMetroLines(json: unknown): MetroLine[] {
  return asArray(json).flatMap((value) => {
    const row = asRecord(value);
    const id = text(row?.LineNo) ?? text(row?.LineID);
    const stationIds = stopsInOrder(row?.Stations);
    return id && stationIds.length > 0 ? [{ id, stationIds }] : [];
  });
}
