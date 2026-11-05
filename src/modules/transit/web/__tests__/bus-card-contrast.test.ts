import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";
import { MODE_COLORS } from "../../lib/lines";

// WCAG 的對比公式 卡片上的字都是白色 要 4.5:1 以上

const channels = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
const linear = (value: number) => (value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
const luminance = ([red, green, blue]: number[]) => 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
const contrastWithWhite = (rgb: number[]) => 1.05 / (luminance(rgb) + 0.05);
const overlayWhite = (rgb: number[], opacity: number) => rgb.map((value) => value + (255 - value) * opacity);

const css = readStylesheet();
const rule = (selector: string) => new RegExp(`${selector.replace(".", "\\.")}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

describe("公車卡的白字", () => {
  const percents = [...rule(".trn-bus-card").matchAll(/color-mix\(in srgb, var\(--trn-line\) (\d+)%, black\)/g)].map((m) => Number(m[1]));
  const lightest = channels(MODE_COLORS.bus).map((value) => (value * Math.max(...percents)) / 100);

  it("使用者要的：原本的公車綠配白字不夠清楚 漸層要加黑", () => {
    expect(contrastWithWhite(channels(MODE_COLORS.bus))).toBeLessThan(4.5);
    expect(percents.length).toBeGreaterThanOrEqual(2);
  });

  it("漸層最亮的地方也要 4.5:1", () => {
    expect(contrastWithWhite(lightest)).toBeGreaterThanOrEqual(4.5);
  });

  it("裝飾的形狀疊上去之後也要 4.5:1", () => {
    const opacity = Number(/rgb\(255 255 255 \/ ([\d.]+)\)/.exec(rule(".trn-bus-card::after"))?.[1]);

    expect(opacity).toBeGreaterThan(0);
    expect(contrastWithWhite(overlayWhite(lightest, opacity))).toBeGreaterThanOrEqual(4.5);
  });
});
