import type { Departure } from "../lib/timetable";

// 每一班坐多久與最快的標籤 高鐵的車票與台鐵的列共用

export const rideOf = ({ at, arrivesAt }: Departure) => (arrivesAt === null ? null : arrivesAt - at);

/** 一樣短取早的 班次本來就照時間排 全部一樣久或只有一班有時間時沒有最快 */
export function fastestTrain(trains: readonly Departure[]): Departure | null {
  const rides = trains.flatMap((train) => rideOf(train) ?? []);
  const shortest = Math.min(...rides);
  if (rides.length < 2 || shortest === Math.max(...rides)) return null;
  return trains.find((train) => rideOf(train) === shortest) ?? null;
}
