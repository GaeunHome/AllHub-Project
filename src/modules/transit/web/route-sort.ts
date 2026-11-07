// 側邊欄拖曳排序的計算 畫面先換好 伺服器照 core/order 的同一套算法存

/** 拖著的卡片排在第幾個 others 是其他卡片的中線 */
export const dropIndex = (others: readonly number[], pointer: number) => others.filter((middle) => middle < pointer).length;

/** 伺服器只收放到哪一條前面 */
export function beforeIdOf(order: readonly number[], id: number): number | null {
  const at = order.indexOf(id);
  return order[at + 1] ?? null;
}
