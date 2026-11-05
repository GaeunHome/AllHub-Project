import { asArray, asRecord, createMissing, numberOf, text } from "@/core/json";
import type { FareKey } from "./timetable";

// 欄位對過 TDX 的 swagger 與公開的真實回應 還沒用這個專案的金鑰驗證
// 認不得 對不上或價錢互相矛盾的一律不顯示 不能顯示錯的價錢

export type Cabin = "標準" | "商務" | "自由";
export type CabinFare = { cabin: Cabin; price: number };
export type TraFare = FareKey & { price: number };

const CABINS: [code: number, cabin: Cabin][] = [[1, "標準"], [2, "商務"], [3, "自由"]];
const ONE_WAY = 1;
const ADULT = 1;
/** 台鐵的車廂只有一般 回應可能不帶這個欄位 */
const TRA_CABIN = 1;

/** 單程全票 優待票 孩童票與早鳥都不算 */
function fullFares(value: unknown): { cabin: number | null; price: number }[] {
  return asArray(value).flatMap((item) => {
    const fare = asRecord(item);
    const price = numberOf(fare?.Price);
    if (numberOf(fare?.TicketType) !== ONE_WAY || numberOf(fare?.FareClass) !== ADULT || price === null || price <= 0) return [];
    return [{ cabin: numberOf(fare?.CabinClass), price }];
  });
}

/** 重複列的一樣價錢算一個 不一樣時不知道哪個對 */
function onlyPrice(prices: number[]): number | null {
  const [first, ...others] = new Set(prices);
  return first !== undefined && others.length === 0 ? first : null;
}

/** 回應可能不帶起訖站 帶了就要對得上 */
function rowsOf(rows: unknown[], originId: string, destinationId: string): (Record<string, unknown> | null)[] {
  return rows.map(asRecord).filter((row) => (text(row?.OriginStationID) ?? originId) === originId && (text(row?.DestinationStationID) ?? destinationId) === destinationId);
}

export function parseThsrFares(json: unknown, originId: string, destinationId: string): { fares: CabinFare[]; missing: string[] } {
  const missing = createMissing();
  const listed = rowsOf(asArray(json), originId, destinationId).flatMap((row) => fullFares(missing.list(row, "Fares", "Fares")));
  const fares = CABINS.flatMap(([code, cabin]) => {
    const price = onlyPrice(listed.filter((fare) => fare.cabin === code).map((fare) => fare.price));
    return price === null ? [] : [{ cabin, price }];
  });
  return { fares, missing: missing.sorted() };
}

/** 一段路有兩個方向 其中一個繞過大半個台灣 所以要連方向一起記 */
export function parseTraFares(json: unknown, originId: string, destinationId: string): { fares: TraFare[]; missing: string[] } {
  const missing = createMissing();
  const prices = new Map<string, number[]>();
  for (const row of rowsOf(missing.list(asRecord(json), "ODFares", "ODFares"), originId, destinationId)) {
    const trainType = missing.need(numberOf(row?.TrainType), "ODFares[].TrainType");
    const direction = missing.need(numberOf(row?.Direction), "ODFares[].Direction");
    const listed = fullFares(missing.list(row, "Fares", "ODFares[].Fares")).filter((fare) => (fare.cabin ?? TRA_CABIN) === TRA_CABIN);
    if (trainType === null || direction === null) continue;
    const key = `${trainType}:${direction}`;
    prices.set(key, [...(prices.get(key) ?? []), ...listed.map((fare) => fare.price)]);
  }
  const fares = [...prices].flatMap(([key, listed]) => {
    const [trainType, direction] = key.split(":").map(Number);
    const price = onlyPrice(listed);
    return price === null ? [] : [{ trainType, direction, price }];
  });
  return { fares, missing: missing.sorted() };
}

export function parseMetroFare(json: unknown, originId: string, destinationId: string): { fare: number | null; missing: string[] } {
  const missing = createMissing();
  const listed = rowsOf(asArray(json), originId, destinationId).flatMap((row) => fullFares(missing.list(row, "Fares", "Fares")));
  return { fare: onlyPrice(listed.map((fare) => fare.price)), missing: missing.sorted() };
}

export function traFareOf(fares: TraFare[], key: FareKey | undefined): number | null {
  if (!key) return null;
  return fares.find((fare) => fare.trainType === key.trainType && fare.direction === key.direction)?.price ?? null;
}

/** 只算列出來的班次對得到的價錢 票價表裡有但沒有一班是那種車的不能當起價 */
export function lowestTraFare(fares: TraFare[], trains: { fareKey?: FareKey }[]): number | null {
  const prices = trains.flatMap(({ fareKey }) => traFareOf(fares, fareKey) ?? []);
  return prices.length > 0 ? Math.min(...prices) : null;
}
