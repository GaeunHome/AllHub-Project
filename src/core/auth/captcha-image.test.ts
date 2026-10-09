import { describe, expect, it } from "vitest";
import { CAPTCHA_ALPHABET, CAPTCHA_GLYPH_CHARS, CAPTCHA_LENGTH, generateCaptchaCode, renderCaptchaSvg } from "./captcha-image";

describe("驗證碼的字", () => {
  it("5 個字，只從不容易看錯的字元裡挑（沒有 0／O／Q、1／I／L、2／Z、5／S、8／B）", () => {
    expect(CAPTCHA_LENGTH).toBe(5);
    for (const ambiguous of "0OQ1IL2Z5S8B") expect(CAPTCHA_ALPHABET).not.toContain(ambiguous);
    for (let i = 0; i < 50; i++) expect(generateCaptchaCode()).toMatch(new RegExp(`^[${CAPTCHA_ALPHABET}]{5}$`));
  });

  it("每次產生的都不一樣（用亂數，不是固定的序列）", () => {
    expect(new Set(Array.from({ length: 30 }, () => generateCaptchaCode())).size).toBeGreaterThan(25);
  });

  it("內建的筆畫字型涵蓋每個字元", () => {
    expect([...CAPTCHA_ALPHABET].sort()).toEqual([...CAPTCHA_GLYPH_CHARS].sort());
  });
});

describe("驗證碼圖片（SVG）", () => {
  it("只用 path 與圓點畫出扭曲的筆畫：沒有 <text>、字型或任何文字內容", () => {
    const svg = renderCaptchaSvg("K7MRX");

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/<text|<tspan|<title|<desc|font/i);
    expect(svg.replace(/<[^>]*>/g, "").trim()).toBe("");
  });

  it("原始碼裡找不到驗證碼（試 200 組亂數驗證碼，大小寫都找）", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCaptchaCode();
      const svg = renderCaptchaSvg(code);
      expect(svg).not.toContain(code);
      expect(svg.toLowerCase()).not.toContain(code.toLowerCase());
    }
  });

  it("同一組驗證碼每次畫出來都不一樣（旋轉、位移、大小、干擾線與雜點都是隨機的）", () => {
    expect(renderCaptchaSvg("K7MRX")).not.toBe(renderCaptchaSvg("K7MRX"));
  });

  it("不認得的字元_直接丟錯（不會畫出少一個字的圖）", () => {
    expect(() => renderCaptchaSvg("K0MRX")).toThrow();
  });
});
