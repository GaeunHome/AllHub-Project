import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_ICON_NAMES } from "./icon";

const UI_ICON_DIR = new URL("../../../public/icons/ui/", import.meta.url);
const SRC = fileURLToPath(new URL("../../", import.meta.url));

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}

describe("UI 圖示", () => {
  // CSS mask 載入失敗不會報錯 畫面上只是少一個圖示
  // 所以在測試裡擋下打錯或被刪掉的檔名
  it("每個圖示名稱在 public/icons/ui/ 都有對應的 SVG", () => {
    const missing = UI_ICON_NAMES.filter((name) => !fs.existsSync(fileURLToPath(new URL(`${name}.svg`, UI_ICON_DIR))));
    expect(missing).toEqual([]);
  });

  it("public/icons/ui/ 裡的 SVG 都列在 UI_ICON_NAMES：拿掉名稱時檔案也要一起刪", () => {
    const files = fs.readdirSync(UI_ICON_DIR).filter((file) => file.endsWith(".svg"));
    expect(files.filter((file) => !(UI_ICON_NAMES as readonly string[]).includes(file.slice(0, -".svg".length)))).toEqual([]);
  });

  // 名稱可能寫成字串 SVG 的路徑 或分類圖示表裡沒加引號的 key
  it("每個圖示名稱在 src 至少用到一次：沒人用的圖示要刪掉", () => {
    const sources = walk(SRC)
      .filter((file) => /\.(ts|tsx|css|mjs)$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.endsWith(path.join("core", "ui", "icon.tsx")))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    const used = (name: string) =>
      new RegExp(`(["'\`])${name}\\1|/icons/ui/${name}\\.svg`).test(sources) || (!name.includes("-") && new RegExp(`(?:^|[\\s{,])${name}\\s*:`, "m").test(sources));

    expect(UI_ICON_NAMES.filter((name) => !used(name))).toEqual([]);
  });
});
