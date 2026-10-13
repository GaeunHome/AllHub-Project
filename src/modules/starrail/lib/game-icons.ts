// 屬性、命途與面板詞條的遊戲圖示：內建在 public/icons/starrail/ 的靜態檔（從社群整理的 StarRailRes 下載，遊戲素材的著作權屬 HoYoverse，見 public/icons/LICENSE.md），瀏覽器不必向 GitHub 載入
// 檔名是 StarRailRes 檔名的 kebab-case（詞條去掉開頭的 Icon），對得回原始檔；HoYoLAB 沒附屬性與命途的圖，詞條也跟著用同一套，來源與風格一致

const ICONS = "/icons/starrail";

// HoYoLAB 的 lightning 在遊戲資料裡叫 Thunder
const ELEMENT_FILES: Record<string, string> = {
  physical: "physical",
  fire: "fire",
  ice: "ice",
  lightning: "thunder",
  wind: "wind",
  quantum: "quantum",
  imaginary: "imaginary",
};

/** base_type 1–9 的順序，跟 characters.ts 的命途名稱一樣 */
const PATH_FILES = ["destruction", "hunt", "erudition", "harmony", "nihility", "preservation", "abundance", "remembrance", "elation"];

/** 認不得的屬性回 null，畫面退回色圓 */
export function elementIconUrl(element: string | null): string | null {
  if (element === null) return null;
  const key = element.toLowerCase();
  return Object.hasOwn(ELEMENT_FILES, key) ? `${ICONS}/element/${ELEMENT_FILES[key]}.png` : null;
}

export function pathIconUrl(path: number | null): string | null {
  return path !== null && Number.isInteger(path) && path >= 1 && path <= PATH_FILES.length ? `${ICONS}/path/${PATH_FILES[path - 1]}.png` : null;
}

// property_type 是哪個屬性依 hoyo-buddy 的 genshin.py 對照表（constants.py 的 YATTA_PROP_TYPE_TO_GPY_TYPE），圖示依 StarRailRes 的 index_new/cht/properties.json；固定值、百分比、基礎值共用同一個圖示
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

/** 面板與遺器詞條的屬性圖示；對照表以外的回 null，畫面不顯示圖示 */
export function propertyIconUrl(type: number | null): string | null {
  const file = type === null ? undefined : PROPERTY_FILE.get(type);
  return file ? `${ICONS}/property/${file}.png` : null;
}
