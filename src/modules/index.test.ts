import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { modules } from "./index";

const PUBLIC_DIR = new URL("../../public/", import.meta.url);

describe("模組清單", () => {
  // 導覽列與首頁用 CSS mask 顯示 info.icon，路徑打錯只會默默少一個圖示，在這裡先擋下
  it("info.icon 都指到 public/ 裡存在的檔案", () => {
    const missing = modules
      .filter((m) => m.icon && !fs.existsSync(fileURLToPath(new URL(`.${m.icon}`, PUBLIC_DIR))))
      .map((m) => `${m.id}：${m.icon}`);
    expect(missing).toEqual([]);
  });
});
