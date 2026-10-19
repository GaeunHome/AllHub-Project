// HoYoLAB 沒附屬性與命途的圖 改用 StarRailRes 的圖內建在 public/icons/starrail/
// 檔名是原檔名的 kebab-case 著作權見 public/icons/LICENSE.md

const ICONS = "/icons/starrail";

/** 畫面上的中文名稱與圖示的檔名 */
type Named = { label: string; file: string };

/**
 * 七種屬性 順序是篩選選單的順序
 * HoYoLAB 的 lightning 在遊戲資料裡叫 Thunder
 */
export const ELEMENTS: Record<string, Named> = {
  physical: { label: "物理", file: "physical" },
  fire: { label: "火", file: "fire" },
  ice: { label: "冰", file: "ice" },
  lightning: { label: "雷", file: "thunder" },
  wind: { label: "風", file: "wind" },
  quantum: { label: "量子", file: "quantum" },
  imaginary: { label: "虛數", file: "imaginary" },
};

/** 命途 照 base_type 1 到 9 的順序 */
const PATHS: Named[] = [
  { label: "毀滅", file: "destruction" },
  { label: "巡獵", file: "hunt" },
  { label: "智識", file: "erudition" },
  { label: "同諧", file: "harmony" },
  { label: "虛無", file: "nihility" },
  { label: "存護", file: "preservation" },
  { label: "豐饒", file: "abundance" },
  { label: "記憶", file: "remembrance" },
  { label: "歡愉", file: "elation" },
];

/** 大小寫不拘 認不得的屬性回 null */
export function elementOf(element: string | null): Named | null {
  if (element === null) return null;
  const key = element.toLowerCase();
  return Object.hasOwn(ELEMENTS, key) ? ELEMENTS[key] : null;
}

/** 認不得的命途回 null */
export function pathOf(path: number | null): Named | null {
  return path !== null && Number.isInteger(path) && path >= 1 && path <= PATHS.length ? PATHS[path - 1] : null;
}

/** 認不得的屬性回 null 畫面退回色圓 */
export function elementIconUrl(element: string | null): string | null {
  const entry = elementOf(element);
  return entry ? `${ICONS}/element/${entry.file}.png` : null;
}

export function pathIconUrl(path: number | null): string | null {
  const entry = pathOf(path);
  return entry ? `${ICONS}/path/${entry.file}.png` : null;
}

// property_type 的對照依 hoyo-buddy 的 YATTA_PROP_TYPE_TO_GPY_TYPE
// 圖示檔名依 StarRailRes 的 properties.json 固定值與百分比共用圖示
const PROPERTY_TYPES: Record<string, number[]> = {
  "max-hp": [1, 26, 27, 32],
  attack: [2, 28, 29, 33],
  defence: [3, 30, 31, 34],
  speed: [4, 35, 51],
  "critical-chance": [5, 52],
  "critical-damage": [6, 53],
  "heal-ratio": [7, 55],
  "energy-recovery": [9, 54],
  "status-probability": [10, 56],
  "status-resistance": [11, 57],
  "break-up": [58, 59],
  "energy-limit": [60],
  joy: [71, 72],
  "physical-added-ratio": [12],
  "fire-added-ratio": [14],
  "ice-added-ratio": [16],
  "thunder-added-ratio": [18],
  "wind-added-ratio": [20],
  "quantum-added-ratio": [22],
  "imaginary-added-ratio": [24],
  "physical-resistance-delta": [13, 37],
  "fire-resistance-delta": [15, 38],
  "ice-resistance-delta": [17, 39],
  "thunder-resistance-delta": [19, 40],
  "wind-resistance-delta": [21, 41],
  "quantum-resistance-delta": [23, 42],
  "imaginary-resistance-delta": [25, 43],
};
const PROPERTY_FILE = new Map(Object.entries(PROPERTY_TYPES).flatMap(([file, types]) => types.map((type) => [type, file] as const)));

/** 面板與遺器詞條的圖示 對照表以外的回 null 畫面就不顯示 */
export function propertyIconUrl(type: number | null): string | null {
  const file = type === null ? undefined : PROPERTY_FILE.get(type);
  return file ? `${ICONS}/property/${file}.png` : null;
}
