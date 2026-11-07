import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const { config } = await import("../proxy");

const APP = fileURLToPath(new URL("../app", import.meta.url));
// v0.2.7 以前的分頁圖示是 create-next-app 留下的 Next 預設圖示 黑底的 N
const NEXT_DEFAULT_FAVICON = "c28fdd2a4f31e2dc64f653962286da5c82a4cdfc518b242d32812c624e9a19a4";

const needsLogin = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

/** ICO 檔頭列出的每張圖 從哪裡開始 有多長 */
function icoImages(ico: Buffer) {
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2)], "不是 ICO 檔").toEqual([0, 1]);
  return Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ({ offset: ico.readUInt32LE(6 + 16 * index + 12), bytes: ico.readUInt32LE(6 + 16 * index + 8) }));
}

describe("瀏覽器分頁的圖示（src/app/favicon.ico）", () => {
  it("換成 AllHub 的花，不是 Next 預設的 N；檔案是完整的 ICO，每張圖都在檔案範圍內", () => {
    const ico = readFileSync(path.join(APP, "favicon.ico"));
    const images = icoImages(ico);

    expect(createHash("sha256").update(ico).digest("hex")).not.toBe(NEXT_DEFAULT_FAVICON);
    expect(images.length).toBeGreaterThan(0);
    for (const { offset, bytes } of images) expect(offset + bytes).toBeLessThanOrEqual(ico.length);
  });

  it("沒登入也讀得到（登入與註冊頁也看得到）：只用根目錄的 favicon.ico，不放 icon、apple-icon 這類檔（網址要登入）", () => {
    const gated = readdirSync(APP, { recursive: true, encoding: "utf8" }).filter((file) => /^(?:icon|apple-icon)\d*\.\w+$/.test(path.basename(file)));

    expect(gated).toEqual([]);
    expect(needsLogin("/favicon.ico")).toBe(false);
  });
});
