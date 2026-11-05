import type { Mode } from "./modes";

// 路線圖的線條顏色 高鐵 台鐵用品牌色 捷運照各線 認不得的用預設色
// 預設色要配得上白字或深色字 太亮太暗都不行
const THSR = "#f26a21";
const TRA = "#2f6fd0";
const METRO = "#0d7a70";
const BUS = "#16a34a";

/** 車站代碼與 TDX 的 LineNo 開頭就是路線 長的放前面 BR 不能被當成 B */
const LINES: Record<string, [prefix: string, color: string, name: string][]> = {
  TRTC: [["BR", "#c48c31", "文湖線"], ["BL", "#0070bd", "板南線"], ["R", "#e3002c", "淡水信義線"], ["G", "#008659", "松山新店線"], ["O", "#f8b61c", "中和新蘆線"], ["Y", "#d4b106", "環狀線"]],
  NTMC: [["Y", "#d4b106", "環狀線"]],
  TYMC: [["A", "#8246af", "機場線"]],
};

/** code 是車站代碼或 LineNo 認不得的路線沒有名稱 */
export function metroLine(system: string, code: string): { name: string | null; color: string } {
  const line = (LINES[system] ?? []).find(([prefix]) => code.startsWith(prefix));
  return { name: line?.[2] ?? null, color: line?.[1] ?? METRO };
}

/** 畫面上一定要有名稱 認不得的路線寫代碼 */
export const metroLineName = (system: string, code: string) => metroLine(system, code).name ?? `${code} 線`;

/** 分頁的顏色 捷運不分路線 */
export const MODE_COLORS: Record<Mode, string> = { thsr: THSR, tra: TRA, metro: METRO, bus: BUS };

export function routeColor(mode: Mode, system: string, stationId: string): string {
  if (mode === "thsr") return THSR;
  if (mode === "tra") return TRA;
  if (mode === "bus") return BUS;
  return metroLine(system, stationId).color;
}

const WHITE = "#ffffff";
const DARK_INK = "#15171c";

const channelOf = (hex: string, start: number) => {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channelOf(hex, 1) + 0.7152 * channelOf(hex, 3) + 0.0722 * channelOf(hex, 5);

/** 站牌代碼的字色 路線色有亮有暗 照 WCAG 的對比選白字或深色字 */
export function plateInk(color: string): string {
  const shade = luminance(color) + 0.05;
  return (luminance(WHITE) + 0.05) / shade >= shade / (luminance(DARK_INK) + 0.05) ? WHITE : DARK_INK;
}
