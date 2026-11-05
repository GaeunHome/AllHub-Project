import { DAY_MS } from "@/core/time";
import { asArray, asRecord, numberOf, text } from "@/core/json";

// 欄位照 TDX 的 OpenAPI 文件 還沒用真實金鑰驗證 讀不到的那一班略過

/** at 是開車時間的毫秒時間戳 伺服器與瀏覽器算起來才會一樣 */
export type Departure = { at: number; arrivesAt: number | null; trainNo: string | null; kind: string | null; toward: string | null };
export type Station = { id: string; name: string };

const CLOCK = /^(\d{2}):(\d{2})/;
/** 跨夜車次在這個時間之前才經過起站 就是隔天的事 */
const OVERNIGHT_BEFORE_MINUTES = 180;

function minutesOf(value: unknown): number | null {
  const match = typeof value === "string" ? CLOCK.exec(value) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 時刻表的時間都是台灣時間 */
const stamp = (date: string, minutes: number) => Date.parse(`${date}T00:00:00+08:00`) + minutes * 60_000;

const zhName = (value: unknown) => text(asRecord(value)?.Zh_tw);

function dailyDeparture(value: unknown, date: string): Departure[] {
  const row = asRecord(value);
  const info = asRecord(row?.DailyTrainInfo);
  const departs = minutesOf(asRecord(row?.OriginStopTime)?.DepartureTime);
  if (!info || departs === null || numberOf(info.SuspendedFlag) === 1) return [];
  const overnight = departs < OVERNIGHT_BEFORE_MINUTES && (Boolean(text(info.OverNightStationID)) || info.Overnight === true);
  const at = stamp(date, departs) + (overnight ? DAY_MS : 0);
  const arrives = minutesOf(asRecord(row?.DestinationStopTime)?.ArrivalTime);
  const arrivesAt = arrives === null ? null : stamp(date, arrives) + (overnight ? DAY_MS : 0);
  return [{ at, arrivesAt: arrivesAt !== null && arrivesAt < at ? arrivesAt + DAY_MS : arrivesAt, trainNo: text(info.TrainNo), kind: zhName(info.TrainTypeName), toward: zhName(info.EndingStationName) }];
}

export function parseDailyTimetable(json: unknown, date: string): Departure[] {
  return asArray(json).flatMap((row) => dailyDeparture(row, date)).sort((a, b) => a.at - b.at);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** 星期照台灣的日期 不是伺服器的時區 */
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00+08:00`).getUTCDay()];

/** 國定假日照星期算 TDX 的服務日只分星期幾 */
export function parseMetroTimetable(json: unknown, date: string, destinationId: string): Departure[] {
  const weekday = weekdayOf(date);
  return asArray(json).flatMap((value) => {
    const row = asRecord(value);
    if (text(row?.DestinationStaionID) !== destinationId || asRecord(row?.ServiceDay)?.[weekday] !== true) return [];
    const toward = zhName(row?.DestinationStationName);
    let previous = -1;
    let dayOffset = 0;
    const stops = asArray(row?.Timetables).flatMap((stop) => {
      const entry = asRecord(stop);
      const minutes = minutesOf(entry?.DepartureTime);
      return minutes === null ? [] : [{ minutes, sequence: numberOf(entry?.Sequence) ?? 0 }];
    });
    return stops
      .sort((a, b) => a.sequence - b.sequence)
      .map(({ minutes }): Departure => {
        // 發車順序不會倒退 時間變小就是過了午夜
        if (minutes < previous) dayOffset = DAY_MS;
        previous = minutes;
        return { at: stamp(date, minutes) + dayOffset, arrivesAt: null, trainNo: null, kind: null, toward };
      });
  });
}

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
  const stations = new Map<string, string>();
  for (const value of asArray(json)) {
    const row = asRecord(value);
    const id = text(row?.StationID);
    const name = zhName(row?.StationName);
    if (id && name && !stations.has(id)) stations.set(id, name);
  }
  return [...stations].map(([id, name]) => ({ id, name }));
}
