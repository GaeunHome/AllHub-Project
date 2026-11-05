import { routeColor } from "../lib/lines";
import type { TransitRoute } from "../data/schema";

/** 捷運的迄站是開往的終點站 不是使用者要下車的站 */
export const destinationLabel = ({ mode, destinationName }: Pick<TransitRoute, "mode" | "destinationName">) => (mode === "metro" || mode === "bus" ? `往${destinationName}` : destinationName);

export const routeLabel = (route: Pick<TransitRoute, "mode" | "line" | "originName" | "destinationName">) => `${route.line ? `${route.line} ` : ""}${route.originName} → ${destinationLabel(route)}`;

export const lineColor = ({ mode, system, originId }: Pick<TransitRoute, "mode" | "system" | "originId">) => routeColor(mode, system, originId);
