import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";
import { MODE_COLORS } from "../../lib/lines";
import { blend, contrastRatio, rgbOf, WHITE } from "../../dev/contrast";

// WCAG 的對比公式 卡片上的字都是白色 要 4.5:1 以上

const css = readStylesheet();
const rule = (selector: string) => new RegExp(`${selector.replace(".", "\\.")}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

describe("公車卡的白字", () => {
  const percents = [...rule(".trn-bus-card").matchAll(/color-mix\(in srgb, var\(--trn-line\) (\d+)%, black\)/g)].map((m) => Number(m[1]));
  const lightest = rgbOf(MODE_COLORS.bus).map((value) => (value * Math.max(...percents)) / 100);

  it("使用者要的：原本的公車綠配白字不夠清楚 漸層要加黑", () => {
    expect(contrastRatio(rgbOf(MODE_COLORS.bus), WHITE)).toBeLessThan(4.5);
    expect(percents.length).toBeGreaterThanOrEqual(2);
  });

  it("漸層最亮的地方也要 4.5:1", () => {
    expect(contrastRatio(lightest, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("裝飾的形狀疊上去之後也要 4.5:1", () => {
    const opacity = Number(/rgb\(255 255 255 \/ ([\d.]+)\)/.exec(rule(".trn-bus-card::after"))?.[1]);

    expect(opacity).toBeGreaterThan(0);
    expect(contrastRatio(blend(WHITE, opacity, lightest), WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});
