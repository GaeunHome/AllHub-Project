// 貼著按鈕的彈出層 ⋮ 選單與 i 說明框共用 放在 top layer 位置照畫面算

export type Box = { left: number; right: number; top: number; bottom: number };
export type Size = { width: number; height: number };
type Placement = {
  /** 想放的左緣 例如置中或對齊按鈕右緣 */
  left: number;
  /** 跟按鈕的距離 */
  gap: number;
  /** 離畫面邊緣至少這麼遠 */
  edge: number;
};

/** 放在按鈕下方 左右夾在畫面內 太寬時靠左 下方放不下而上方放得下才改放上方 */
export function placeNear(anchor: Box, popup: Size, viewport: Size, { left, gap, edge }: Placement): { left: number; top: number } {
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - popup.height;
  return {
    left: Math.max(edge, Math.min(left, viewport.width - edge - popup.width)),
    top: below + popup.height <= viewport.height - edge || above < edge ? below : above,
  };
}
