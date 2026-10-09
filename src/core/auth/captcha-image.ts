import "server-only";
import { randomInt } from "node:crypto";

// 圖形驗證碼的圖：用內建的筆畫字型畫成扭曲過的 <path>，原始碼裡沒有 <text> 也沒有字元本身，機器人不能直接讀 SVG 破解

/** 不容易看錯的字元：拿掉 0／O／Q、1／I／L、2／Z、5／S、8／B、G／6 這些長得像的 */
export const CAPTCHA_ALPHABET = "ACDEFHJKMNPRTUVWXY34679";
export const CAPTCHA_LENGTH = 5;

type Point = readonly [number, number];
type Glyph = readonly (readonly Point[])[];

// 每個字元是幾條折線，座標在寬 10、高 14 的格子裡（y 往下）；曲線用多個點逼近，畫的時候再整組扭曲
const GLYPHS: Readonly<Record<string, Glyph>> = {
  A: [
    [[0, 14], [5, 0], [10, 14]],
    [[2.3, 8.5], [7.7, 8.5]],
  ],
  C: [[[10, 2.5], [7.5, 0.4], [4, 0.4], [1.2, 2.6], [0, 7], [1.2, 11.4], [4, 13.6], [7.5, 13.6], [10, 11.5]]],
  D: [[[0, 0], [0, 14], [4.5, 14], [8.2, 12.2], [10, 7], [8.2, 1.8], [4.5, 0], [0, 0]]],
  E: [
    [[10, 0], [0, 0], [0, 14], [10, 14]],
    [[0, 7], [7.5, 7]],
  ],
  F: [
    [[10, 0], [0, 0], [0, 14]],
    [[0, 7], [7.5, 7]],
  ],
  H: [
    [[0, 0], [0, 14]],
    [[10, 0], [10, 14]],
    [[0, 7], [10, 7]],
  ],
  J: [
    [[2, 0], [10, 0]],
    [[7.5, 0], [7.5, 10], [6.3, 13.2], [3.8, 14], [1.3, 13.2], [0, 10.5]],
  ],
  K: [
    [[0, 0], [0, 14]],
    [[10, 0], [0, 8.5]],
    [[3.2, 5.8], [10, 14]],
  ],
  M: [[[0, 14], [0, 0], [5, 8.5], [10, 0], [10, 14]]],
  N: [[[0, 14], [0, 0], [10, 14], [10, 0]]],
  P: [[[0, 14], [0, 0], [6.5, 0], [9.2, 1.3], [10, 4], [9.2, 6.7], [6.5, 8], [0, 8]]],
  R: [
    [[0, 14], [0, 0], [6.5, 0], [9.2, 1.3], [10, 4], [9.2, 6.7], [6.5, 8], [0, 8]],
    [[5, 8], [10, 14]],
  ],
  T: [
    [[0, 0], [10, 0]],
    [[5, 0], [5, 14]],
  ],
  U: [[[0, 0], [0, 9.5], [1.4, 12.8], [5, 14], [8.6, 12.8], [10, 9.5], [10, 0]]],
  V: [[[0, 0], [5, 14], [10, 0]]],
  W: [[[0, 0], [2.5, 14], [5, 5], [7.5, 14], [10, 0]]],
  X: [
    [[0, 0], [10, 14]],
    [[10, 0], [0, 14]],
  ],
  Y: [
    [[0, 0], [5, 7], [10, 0]],
    [[5, 7], [5, 14]],
  ],
  "3": [
    [[0.5, 1.8], [3, 0], [7, 0], [9.5, 1.8], [9.5, 4.8], [7, 6.8], [4, 6.8]],
    [[7, 6.8], [10, 9], [10, 12], [7, 14], [3, 14], [0, 12.2]],
  ],
  "4": [[[7.5, 14], [7.5, 0], [0, 10], [10, 10]]],
  "6": [[[9, 1.2], [6.5, 0], [3.5, 0.4], [1.2, 2.8], [0, 7], [0, 10.5], [1.8, 13.4], [5, 14], [8.2, 13.4], [10, 11], [10, 9], [8.2, 6.8], [5, 6.4], [2, 7.4], [0, 10]]],
  "7": [[[0, 0], [10, 0], [4, 14]]],
  "9": [[[10, 4], [8, 6.6], [5, 7.4], [1.8, 6.6], [0, 4.4], [0, 3], [1.8, 0.6], [5, 0], [8.2, 0.6], [10, 3], [10, 7], [9, 11], [6.8, 13.6], [3.6, 14], [1, 12.8]]],
};

export const CAPTCHA_GLYPH_CHARS = Object.keys(GLYPHS);

const WIDTH = 170;
const HEIGHT = 60;
// 深色的字與淺色的干擾：灰階才不會在深色模式或色弱時看不清楚
const INK = ["#1e293b", "#27272a", "#334155", "#3f3f46"];
const NOISE = ["#64748b", "#94a3b8", "#a1a1aa"];

/** 驗證碼本身用密碼學等級的亂數；圖的扭曲只要看起來亂就好 */
export function generateCaptchaCode(): string {
  return Array.from({ length: CAPTCHA_LENGTH }, () => CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]).join("");
}

export function renderCaptchaSvg(code: string, random: () => number = Math.random): string {
  const between = (min: number, max: number) => min + random() * (max - min);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const num = (value: number) => value.toFixed(1);
  const polyline = (points: readonly Point[], color: string, width: number) =>
    `<path d="M${points.map(([x, y]) => `${num(x)} ${num(y)}`).join(" L")}" fill="none" stroke="${color}" stroke-width="${num(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;

  const elements: string[] = [];
  [...code].forEach((char, index) => {
    const glyph = GLYPHS[char];
    if (!glyph) throw new Error("驗證碼含有字型沒有的字元");
    const scale = between(1.9, 2.3);
    const angle = between(-0.38, 0.38);
    const shear = between(-0.25, 0.25);
    const cx = 20 + index * 31 + between(-3, 3);
    const cy = HEIGHT / 2 + between(-4, 4);
    const color = pick(INK);
    const width = between(2.2, 2.8);
    for (const stroke of glyph) {
      const points = stroke.map(([x, y]): Point => {
        // 以格子中心為原點：先斜切、縮放，再旋轉，每個點再多抖一點，同一個字每次的座標都不一樣
        const sx = (x - 5 + shear * (y - 7)) * scale + between(-0.7, 0.7);
        const sy = (y - 7) * scale + between(-0.7, 0.7);
        return [cx + sx * Math.cos(angle) - sy * Math.sin(angle), cy + sx * Math.sin(angle) + sy * Math.cos(angle)];
      });
      elements.push(polyline(points, color, width));
    }
  });

  // 干擾線有一條跟字同色、短筆畫也跟字差不多粗，不能只靠屬性把干擾濾掉；其他的淡一點，人還看得清楚
  for (let i = 0; i < 5; i++) {
    const glyphLike = i === 0;
    let y = between(10, HEIGHT - 10);
    const points = Array.from({ length: 6 }, (_, step): Point => {
      y = Math.min(HEIGHT - 6, Math.max(6, y + between(-9, 9)));
      return [(step / 5) * WIDTH + between(-6, 6), y];
    });
    elements.push(polyline(points, glyphLike ? pick(INK) : pick(NOISE), glyphLike ? between(1.2, 1.6) : between(0.7, 1.1)));
  }
  for (let i = 0; i < 3; i++) {
    const x = between(10, WIDTH - 10);
    const y = between(8, HEIGHT - 8);
    elements.push(polyline([[x, y], [x + between(-7, 7), y + between(-7, 7)]], pick(INK), between(1.4, 2)));
  }
  for (let i = 0; i < 45; i++) {
    elements.push(`<circle cx="${num(between(0, WIDTH))}" cy="${num(between(0, HEIGHT))}" r="${num(between(0.6, 1.5))}" fill="${pick(NOISE)}"/>`);
  }

  // 打亂順序：字的筆畫不會照順序出現在原始碼裡
  for (let i = elements.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [elements[i], elements[j]] = [elements[j], elements[i]];
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#f8fafc"/>${elements.join("")}</svg>`;
}
