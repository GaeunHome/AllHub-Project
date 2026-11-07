import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";

// 這一版在瀏覽器發現的 手機上天氣頁可以左右滑
// 格線的欄最小寬度是 auto 時 橫向滑的那一排 像 24 小時與城市膠囊 整排的寬度會把欄撐開

const css = readStylesheet(fileURLToPath(new URL("../weather.css", import.meta.url))).replace(/\/\*[\s\S]*?\*\//g, "");

/** 這個選擇器的規則裡 @apply 的 class */
function appliedClasses(selector: string): string[] {
  return [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(",").some((part) => part.trim() === selector))
    .flatMap((m) => [...m[2].matchAll(/@apply\s+([^;]+);/g)].flatMap((apply) => apply[1].trim().split(/\s+/)));
}

const BREAKPOINTS = ["", "sm", "md", "lg", "xl", "2xl"];
const variantOf = (token: string) => (token.includes(":") ? token.slice(0, token.lastIndexOf(":")) : "");
const utilityOf = (token: string) => token.slice(token.lastIndexOf(":") + 1);

/** 從格線打開的寬度起 每個寬度實際用的欄 沒寫欄的寬度是 null 瀏覽器會自己開 auto 的欄 */
function columnsByWidth(selector: string): Map<string, string[] | null> {
  const classes = appliedClasses(selector);
  const gridFrom = BREAKPOINTS.findIndex((width) => classes.some((token) => variantOf(token) === width && utilityOf(token) === "grid"));
  const widths = new Map<string, string[] | null>();
  if (gridFrom === -1) return widths;
  let current: string[] | null = null;
  for (const width of BREAKPOINTS.slice(gridFrom)) {
    for (const token of classes.filter((value) => variantOf(value) === width)) {
      const arbitrary = /^grid-cols-\[(.+)\]$/.exec(utilityOf(token));
      // Tailwind 的 grid-cols-N 是 repeat(N, minmax(0, 1fr))
      const counted = /^grid-cols-(\d+)$/.exec(utilityOf(token));
      if (arbitrary) current = arbitrary[1].split("_");
      else if (counted) current = Array.from({ length: Number(counted[1]) }, () => "minmax(0,1fr)");
    }
    widths.set(width, current);
  }
  return widths;
}

describe("天氣頁的格線（web/weather.css）", () => {
  it.each([".wx-layout", ".wx-more"])("%s 放了橫向滑的一排：每個寬度都寫明欄，最小寬度是 0，手機上整頁不會左右滑", (selector) => {
    const widths = columnsByWidth(selector);

    expect(widths.size, `${selector} 不是格線`).toBeGreaterThan(0);
    for (const [width, tracks] of widths) {
      expect(tracks, `${selector} 在 ${width || "手機"} 沒寫欄`).not.toBeNull();
      for (const track of tracks ?? []) expect(track, `${selector} 在 ${width || "手機"}`).toMatch(/^minmax\(0,/);
    }
  });
});
