// 交通工具與捷運系統 資料來源是交通部 TDX 的軌道 API

export const MODES = ["thsr", "tra", "metro", "bus"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = { thsr: "高鐵", tra: "台鐵", metro: "捷運", bus: "公車" };

/** TDX 的系統代碼 使用者要的 先做臺北捷運與機場捷運 環狀線在 TDX 是新北捷運 */
export const METRO_SYSTEMS = { TRTC: "臺北捷運", NTMC: "環狀線", TYMC: "機場捷運" } as const;
export type MetroSystem = keyof typeof METRO_SYSTEMS;

/** 有即時到站的系統 其他的只能照時刻表 */
const LIVE_SYSTEMS: readonly string[] = ["TRTC", "TYMC"];
export const hasMetroLive = (system: string | null) => system !== null && LIVE_SYSTEMS.includes(system);

type RouteLine = { mode: Mode; line: string };

/** 常用路線的 line 欄位 高鐵與台鐵是車次 公車是路線 捷運是空的 */
export const trainNoOf = ({ mode, line }: RouteLine) => (mode === "thsr" || mode === "tra" ? line : "");
export const busLineOf = ({ mode, line }: RouteLine) => (mode === "bus" ? line : "");

export const isMode = (value: string): value is Mode => (MODES as readonly string[]).includes(value);
export const isMetroSystem = (value: string): value is MetroSystem => Object.hasOwn(METRO_SYSTEMS, value);
