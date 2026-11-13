// WCAG 的對比公式 測試自己照公式算一份 不用正式程式的 才驗得出它算錯

export type Rgb = number[];

/** #rrggbb 的三個通道 0 到 255 */
export const rgbOf = (hex: string): Rgb => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

export const WHITE: Rgb = rgbOf("#ffffff");

const linear = (value: number) => (value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
const luminance = ([red, green, blue]: Rgb) => 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);

/** 亮的除以暗的 字要 4.5:1 以上 顏色可以給色碼或通道 */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const [light, dark] = [a, b].map((color) => luminance(typeof color === "string" ? rgbOf(color) : color)).sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** top 用 opacity 的不透明度疊在 bottom 上 */
export const blend = (top: Rgb, opacity: number, bottom: Rgb): Rgb => top.map((value, index) => value * opacity + bottom[index] * (1 - opacity));
