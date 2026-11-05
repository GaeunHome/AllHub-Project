// 交通工具與捷運系統 資料來源是交通部 TDX 的軌道 API

export const MODES = ["thsr", "tra", "metro", "bus"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = { thsr: "高鐵", tra: "台鐵", metro: "捷運", bus: "公車" };

/** TDX 的系統代碼 台中捷運的時刻表與看板介面都沒有列出 */
export const METRO_SYSTEMS = { TRTC: "臺北捷運", NTMC: "新北捷運", TYMC: "桃園捷運", KRTC: "高雄捷運", KLRT: "高雄輕軌", NTDLRT: "淡海輕軌", NTALRT: "安坑輕軌" } as const;
export type MetroSystem = keyof typeof METRO_SYSTEMS;

/** 有即時到站的系統 其他的只能照時刻表 */
const LIVE_SYSTEMS: readonly string[] = ["TRTC", "KRTC", "KLRT", "TYMC"];
export const hasMetroLive = (system: string | null) => system !== null && LIVE_SYSTEMS.includes(system);

export const isMode = (value: string): value is Mode => (MODES as readonly string[]).includes(value);
export const isMetroSystem = (value: string): value is MetroSystem => Object.hasOwn(METRO_SYSTEMS, value);
