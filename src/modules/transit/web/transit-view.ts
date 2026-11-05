import { trainNoOf } from "../lib/modes";
import { routeColor } from "../lib/lines";
import type { TransitRoute } from "../data/schema";

/** 捷運的迄站是開往的終點站 不是使用者要下車的站 */
export const destinationLabel = ({ mode, destinationName }: Pick<TransitRoute, "mode" | "destinationName">) => (mode === "metro" || mode === "bus" ? `往${destinationName}` : destinationName);

function lineLabel(route: Pick<TransitRoute, "mode" | "line">): string {
  const trainNo = trainNoOf(route);
  return trainNo ? `${trainNo} 車次 ` : route.line ? `${route.line} ` : "";
}

export const routeLabel = (route: Pick<TransitRoute, "mode" | "line" | "originName" | "destinationName">) => `${lineLabel(route)}${route.originName} → ${destinationLabel(route)}`;

/** 查詢結果每班要坐多久 */
export function rideText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} 分`;
  return rest === 0 ? `${hours} 小時` : `${hours} 小時 ${rest} 分`;
}

export const lineColor = ({ mode, system, originId }: Pick<TransitRoute, "mode" | "system" | "originId">) => routeColor(mode, system, originId);
