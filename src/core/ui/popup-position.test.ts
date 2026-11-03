import { describe, expect, it } from "vitest";
import { placeNear } from "./popup-position";

// 寬螢幕的 ⋮ 選單 16rem 寬 對齊按鈕右緣 跟按鈕隔 4px 離畫面邊緣至少 8px
const MENU = { gap: 4, edge: 8 };
const SIZE = { width: 256, height: 200 };
const VIEWPORT = { width: 1440, height: 900 };
const button = (left: number, top: number) => ({ left, right: left + 36, top, bottom: top + 36 });

describe("貼著按鈕的彈出層放在哪裡（placeNear）", () => {
  it("⋮ 選單：右緣對齊按鈕右緣，放在按鈕下方", () => {
    const anchor = button(1000, 100);
    expect(placeNear(anchor, SIZE, VIEWPORT, { ...MENU, left: anchor.right - SIZE.width })).toEqual({ left: 780, top: 140 });
  });

  it("⋮ 選單：按鈕太靠左，左邊留 8px；下方放不下改放上方", () => {
    const anchor = button(100, 800);
    expect(placeNear(anchor, SIZE, VIEWPORT, { ...MENU, left: anchor.right - SIZE.width })).toEqual({ left: 8, top: 596 });
  });
});
