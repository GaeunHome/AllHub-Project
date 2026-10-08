export type Direction = "up" | "down";

/** 回傳交換後的新順序；已經在最前／最後或找不到時回傳 null，呼叫端就不用寫資料庫 */
export function moveInOrder(ids: number[], id: number, direction: Direction): number[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
