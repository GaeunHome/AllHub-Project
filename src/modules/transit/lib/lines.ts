import type { Mode } from "./modes";

// 路線圖的線條顏色 高鐵 台鐵用品牌色 捷運照各線 認不得的用預設色
const THSR = "#f26a21";
const TRA = "#2f6fd0";
const METRO = "#0f8a7e";
const BUS = "#16a34a";

/** 車站代碼開頭就是路線 長的放前面 BR 不能被當成 B */
const LINES: Record<string, [string, string][]> = {
  TRTC: [["BR", "#c48c31"], ["BL", "#0070bd"], ["R", "#e3002c"], ["G", "#008659"], ["O", "#f8b61c"], ["Y", "#d4b106"]],
  NTMC: [["Y", "#d4b106"]],
  KRTC: [["R", "#e20b65"], ["O", "#faa73f"]],
  TYMC: [["A", "#8246af"]],
  KLRT: [["C", "#7cbd52"]],
};

export function routeColor(mode: Mode, system: string, stationId: string): string {
  if (mode === "thsr") return THSR;
  if (mode === "tra") return TRA;
  if (mode === "bus") return BUS;
  return (LINES[system] ?? []).find(([prefix]) => stationId.startsWith(prefix))?.[1] ?? METRO;
}
