// 天氣頁的小量表 色條每一級等寬 標記在那一級裡照比例走 不會壓在兩級的交界

/** maxes 是每一級的上限 上限含在那一級裡 最後一級沒有上限 畫到 top 為止 回傳 0 到 100 */
export function levelPosition(value: number, maxes: readonly number[], top: number): number {
  const found = maxes.findIndex((max) => value <= max);
  const level = found === -1 ? maxes.length - 1 : found;
  const low = level === 0 ? 0 : maxes[level - 1];
  const end = (Number.isFinite(maxes[level]) ? maxes[level] : top) + 1;
  const within = Math.min(Math.max((value - low) / (end - low), 0), 1);
  return ((level + within) / maxes.length) * 100;
}
