import { asArray, asRecord, numberOf, text } from "@/core/json";

/** 車次對誤點分鐘 看板只有前後 30 分鐘的車次 */
export function parseTraDelays(json: unknown): Record<string, number> {
  const delays: Record<string, number> = {};
  for (const value of asArray(json)) {
    const row = asRecord(value);
    const trainNo = text(row?.TrainNo);
    const delay = numberOf(row?.DelayTime);
    if (trainNo && delay !== null) delays[trainNo] = delay;
  }
  return delays;
}

/**
 * 這個方向最快的一班還有幾分鐘 TDX 只給到分鐘
 * 舊欄位拼成 DestinationStaionID 文件上兩個都有
 */
export function parseMetroEstimate(json: unknown, destinationId: string): number | null {
  const minutes = asArray(json).flatMap((value) => {
    const row = asRecord(value);
    if ((text(row?.DestinationStationID) ?? text(row?.DestinationStaionID)) !== destinationId || numberOf(row?.ServiceStatus) !== 0) return [];
    const estimate = numberOf(row?.EstimateTime);
    return estimate === null ? [] : [estimate];
  });
  return minutes.length > 0 ? Math.min(...minutes) : null;
}
