import { formatTaipeiHourMinute } from "@/core/time";
import type { Departure } from "../lib/timetable";

// 查詢結果的分組與標籤 高鐵的車票與台鐵的列共用

export type DayPart = "早上" | "下午" | "晚上";
export type TrainGroup = { part: DayPart; trains: Departure[] };

export function dayPartOf(at: number): DayPart {
  const hour = Number(formatTaipeiHourMinute(new Date(at)).slice(0, 2));
  if (hour < 12) return "早上";
  return hour < 18 ? "下午" : "晚上";
}

/** 照班次原本的順序接成一組 跨夜的車才會排在晚上後面 */
export function groupByDayPart(trains: readonly Departure[]): TrainGroup[] {
  const groups: TrainGroup[] = [];
  for (const train of trains) {
    const part = dayPartOf(train.at);
    const last = groups.at(-1);
    if (last?.part === part) last.trains.push(train);
    else groups.push({ part, trains: [train] });
  }
  return groups;
}

export const rideOf = ({ at, arrivesAt }: Departure) => (arrivesAt === null ? null : arrivesAt - at);

/** 一樣短取早的 班次本來就照時間排 全部一樣久或只有一班有時間時沒有最快 */
export function fastestTrain(trains: readonly Departure[]): Departure | null {
  const rides = trains.flatMap((train) => rideOf(train) ?? []);
  const shortest = Math.min(...rides);
  if (rides.length < 2 || shortest === Math.max(...rides)) return null;
  return trains.find((train) => rideOf(train) === shortest) ?? null;
}
