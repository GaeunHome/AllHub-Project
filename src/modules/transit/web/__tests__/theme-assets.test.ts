import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";

// 使用者要的 圖都是自己畫的靜態檔 不放官方標誌 也不向外載入

const PUBLIC = join(process.cwd(), "public");
const FOLDER = join(PUBLIC, "images/transit");
const SCENES = ["thsr", "tra", "metro"].map((mode) => `images/scenes/transit-${mode}.svg`);
const OWN_IMAGES = readdirSync(FOLDER).filter((file) => file.endsWith(".svg")).map((file) => `images/transit/${file}`);
const SVG_MAX_BYTES = 20 * 1024;
const css = readStylesheet();

describe("交通的主題圖", () => {
  it.each(SCENES)("%s 存在", (file) => {
    expect(existsSync(join(PUBLIC, file))).toBe(true);
  });

  it.each([...SCENES, ...OWN_IMAGES])("%s 不到 20 KB 沒有文字 腳本與外部連結", (file) => {
    const svg = readFileSync(join(PUBLIC, file), "utf8");

    expect(statSync(join(PUBLIC, file)).size).toBeLessThan(SVG_MAX_BYTES);
    expect(svg).not.toMatch(/<script|<text|<image|<foreignObject|href|\son[a-z]+=|data:/i);
    expect(svg.replaceAll("http://www.w3.org/2000/svg", "")).not.toContain("http");
  });

  it("自己畫的圖都有寫在授權說明裡", () => {
    const license = readFileSync(join(FOLDER, "LICENSE.md"), "utf8");

    expect(OWN_IMAGES.length).toBeGreaterThan(0);
    for (const file of OWN_IMAGES) expect(license).toContain(file.split("/").at(-1));
  });

  it("樣式裡的圖都在靜態資料夾 不內嵌也不向外面載入", () => {
    const urls = [...css.matchAll(/\.trn-[^{]*\{[^}]*url\("([^"]+)"\)/g)].map((match) => match[1]);

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(existsSync(join(PUBLIC, url)), url).toBe(true);
  });
});
