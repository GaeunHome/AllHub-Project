import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORLD_CITIES } from "../cities";
import { cityPhoto, photoCredit } from "../city-photos";
import { COUNTIES } from "../counties";

const FOLDER = "public/images/cities";
const PLACES = [...COUNTIES, ...WORLD_CITIES.map((place) => place.name)];
const KB = 1024;
const photosOf = () => PLACES.flatMap((name) => cityPhoto(name) ?? []);
const fileOf = (src: string) => src.replace("/images/cities/", "");

describe("天氣頁的城市照片", () => {
  it("每個內建地點一張：22 個縣市加 22 個國外城市", () => {
    for (const name of PLACES) expect(cityPhoto(name), name).not.toBeNull();
    expect(photosOf()).toHaveLength(44);
  });

  it("一個地點一張不重複：新竹市與新竹縣 嘉義市與嘉義縣是不同的地點", () => {
    expect(new Set(photosOf().map((photo) => photo.src)).size).toBe(44);
    expect(cityPhoto("新竹市")?.src).not.toBe(cityPhoto("新竹縣")?.src);
    expect(cityPhoto("嘉義市")?.src).not.toBe(cityPhoto("嘉義縣")?.src);
  });

  it("每張都有檔案 資料夾裡沒有多的檔", () => {
    const files = readdirSync(FOLDER).filter((name) => name !== "LICENSE.md");

    expect(files.toSorted()).toEqual(photosOf().map((photo) => fileOf(photo.src)).toSorted());
  });

  it("檔名是 ASCII kebab-case", () => {
    for (const { src } of photosOf()) expect(fileOf(src)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.webp$/);
  });

  it("都是真的 WebP 每張 250 KB 內 合計 10 MB 內", () => {
    let total = 0;
    for (const { src } of photosOf()) {
      const path = `public${src}`;
      const head = readFileSync(path).subarray(0, 12).toString("latin1");
      const { size } = statSync(path);
      expect(head.slice(0, 4) + head.slice(8), src).toBe("RIFFWEBP");
      expect(size, src).toBeLessThanOrEqual(250 * KB);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(10 * KB * KB);
  });

  it("LICENSE.md 列到每個檔 每一列都寫出作者 授權與原始頁面", () => {
    const rows = readFileSync(`${FOLDER}/LICENSE.md`, "utf8").split("\n");

    for (const name of PLACES) {
      const photo = cityPhoto(name);
      const row = rows.find((line) => line.includes(`\`${fileOf(photo?.src ?? "")}\``));
      expect(row, name).toContain(name);
      expect(row, name).toContain(photo?.author);
      expect(row, name).toContain(photo?.license);
      expect(row, name).toMatch(/https:\/\/(commons\.wikimedia\.org\/wiki\/File:|unsplash\.com\/photos\/)/);
    }
  });

  it("舊的英文搜尋加進來的城市沒有照片 物件內建的名稱也不算", () => {
    for (const name of ["Seattle, United States", "constructor", "__proto__", ""]) expect(cityPhoto(name), name).toBeNull();
  });

  it("授權要標示作者 所以每張都寫得出「照片：作者（授權）」", () => {
    for (const photo of photosOf()) expect(photoCredit(photo)).toBe(`照片：${photo.author}（${photo.license}）`);
  });
});
