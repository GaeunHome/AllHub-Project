// 查詢結果的分頁 使用者要的 班次多時一頁一頁看

export const PAGE_SIZE = 10;
/** 頁碼最多幾格 超過的收成省略號 */
const SLOTS = 7;

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

export const pageSlice = <T>(items: readonly T[], page: number): T[] => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** 一律 7 格 換頁時按鈕的位置才不會跳來跳去 */
export function pageNumbers(current: number, total: number): (number | "gap")[] {
  if (total <= SLOTS) return range(1, total);
  if (current <= 4) return [...range(1, 5), "gap", total];
  if (current >= total - 3) return [1, "gap", ...range(total - 4, total)];
  return [1, "gap", current - 1, current, current + 1, "gap", total];
}
