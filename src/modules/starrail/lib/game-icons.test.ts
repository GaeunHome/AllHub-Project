import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { elementIconUrl, pathIconUrl, propertyIconUrl } from "./game-icons";

const ICONS = "/icons/starrail";
const PUBLIC_DIR = new URL("../../../../public/", import.meta.url);
const ELEMENTS = ["physical", "fire", "ice", "lightning", "wind", "quantum", "imaginary"];

describe("遊戲圖示：內建在 public/icons/starrail/ 的靜態檔（站內路徑，瀏覽器不再向 GitHub 載入）", () => {
  it("七種屬性：雷的檔名照遊戲資料叫 thunder；大小寫不拘", () => {
    expect(ELEMENTS.map(elementIconUrl)).toEqual(["physical", "fire", "ice", "thunder", "wind", "quantum", "imaginary"].map((name) => `${ICONS}/element/${name}.png`));
    expect(elementIconUrl("Quantum")).toBe(`${ICONS}/element/quantum.png`);
  });

  it("認不得的屬性與 null_回 null，畫面退回色圓", () => {
    expect(elementIconUrl("aether")).toBeNull();
    expect(elementIconUrl(null)).toBeNull();
    expect(elementIconUrl("constructor")).toBeNull();
  });

  it("命途 base_type 1–9：記憶是 remembrance、歡愉是 elation", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(pathIconUrl)).toEqual(
      ["destruction", "hunt", "erudition", "harmony", "nihility", "preservation", "abundance", "remembrance", "elation"].map((name) => `${ICONS}/path/${name}.png`),
    );
  });

  it("認不得的命途_回 null", () => {
    expect(pathIconUrl(0)).toBeNull();
    expect(pathIconUrl(10)).toBeNull();
    expect(pathIconUrl(1.5)).toBeNull();
    expect(pathIconUrl(null)).toBeNull();
  });
});

/**
 * 期望每個 property_type 對到 property 資料夾裡的哪個檔
 * 檔名是 StarRailRes 的 Icon*.png 去掉 Icon 再轉成 kebab-case
 */
const PROPERTY_FILES: Record<number, string> = {
  // 面板
  1: "max-hp", 2: "attack", 3: "defence", 4: "speed", 5: "critical-chance", 6: "critical-damage", 7: "heal-ratio", 9: "energy-recovery", 10: "status-probability", 11: "status-resistance",
  26: "max-hp", 28: "attack", 30: "defence", 35: "speed", 60: "energy-limit",
  // 遺器的主屬性與副詞條 固定值與百分比是同一個圖示
  27: "max-hp", 29: "attack", 31: "defence", 32: "max-hp", 33: "attack", 34: "defence", 51: "speed", 52: "critical-chance", 53: "critical-damage",
  54: "energy-recovery", 55: "heal-ratio", 56: "status-probability", 57: "status-resistance", 58: "break-up", 59: "break-up", 71: "joy", 72: "joy",
  // 位面球的屬性傷害提高與屬性抗性
  12: "physical-added-ratio", 14: "fire-added-ratio", 16: "ice-added-ratio", 18: "thunder-added-ratio", 20: "wind-added-ratio", 22: "quantum-added-ratio", 24: "imaginary-added-ratio",
  13: "physical-resistance-delta", 15: "fire-resistance-delta", 17: "ice-resistance-delta", 19: "thunder-resistance-delta", 21: "wind-resistance-delta", 23: "quantum-resistance-delta", 25: "imaginary-resistance-delta",
  37: "physical-resistance-delta", 38: "fire-resistance-delta", 39: "ice-resistance-delta", 40: "thunder-resistance-delta", 41: "wind-resistance-delta", 42: "quantum-resistance-delta", 43: "imaginary-resistance-delta",
};

describe("面板與遺器詞條的屬性圖示", () => {
  it("HoYoLAB 的 property_type 換成遊戲資料裡的屬性，再換成內建的圖示檔", () => {
    for (const [type, file] of Object.entries(PROPERTY_FILES)) expect(propertyIconUrl(Number(type)), `property_type ${type}`).toBe(`${ICONS}/property/${file}.png`);
  });

  it("對照表以外的 property_type 與 null_回 null，畫面不顯示圖示", () => {
    for (const type of [0, 8, 36, 44, 50, 61, 73, 1.5, -1]) expect(propertyIconUrl(type), `property_type ${type}`).toBeNull();
    expect(propertyIconUrl(null)).toBeNull();
  });

  it("會顯示圖示的 property_type 都列在上面的期望表裡（0–999 掃一遍）：下面檢查檔案時每一個都檢查得到", () => {
    const mapped = Array.from({ length: 1000 }, (_, type) => type).filter((type) => propertyIconUrl(type) !== null);

    expect(mapped).toEqual(Object.keys(PROPERTY_FILES).map(Number));
  });
});

describe("內建的圖示檔", () => {
  const used = [...ELEMENTS.map(elementIconUrl), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(pathIconUrl), ...Object.keys(PROPERTY_FILES).map((type) => propertyIconUrl(Number(type)))];

  // 靜態檔不存在時 next/image 只會顯示破圖 在測試裡擋下打錯或漏放的檔名
  it("每個對照到的圖示在 public/ 都有對應的 PNG", () => {
    const missing = used.filter((url) => !url || !fs.existsSync(fileURLToPath(new URL(`.${url}`, PUBLIC_DIR))));
    expect(missing).toEqual([]);
  });

  it("public/icons/starrail/ 裡沒有對照不到、用不到的檔", () => {
    const files = ["element", "path", "property"].flatMap((dir) => fs.readdirSync(fileURLToPath(new URL(`.${ICONS}/${dir}/`, PUBLIC_DIR))).map((file) => `${ICONS}/${dir}/${file}`));
    expect(files.filter((file) => !used.includes(file))).toEqual([]);
  });
});
