import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_ICON_NAMES } from "./icon";

const UI_ICON_DIR = new URL("../../../public/icons/ui/", import.meta.url);

describe("UI 圖示", () => {
  // CSS mask 載入失敗不會報錯，畫面上只是少一個圖示，所以在測試裡擋下打錯或被刪掉的檔名
  it("每個圖示名稱在 public/icons/ui/ 都有對應的 SVG", () => {
    const missing = UI_ICON_NAMES.filter((name) => !fs.existsSync(fileURLToPath(new URL(`${name}.svg`, UI_ICON_DIR))));
    expect(missing).toEqual([]);
  });
});
