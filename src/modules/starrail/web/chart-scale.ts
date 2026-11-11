// 長條與進度條的長度 開拓月曆 活動日曆與躍遷摘要共用 回傳 0 到 100

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** 最大的那一項是 100 其他照比例 沒有數字或全部是 0 時畫成 0 */
export function shareOfMax(values: readonly (number | null)[]): number[] {
  const max = Math.max(0, ...values.map((value) => value ?? 0));
  return values.map((value) => (max === 0 || value === null ? 0 : oneDecimal((Math.max(0, value) / max) * 100)));
}

/** 從開始到結束過了多少 還沒開始是 0 結束了是 100 沒有時間是 null */
export function elapsedPercent(startsAt: number | null, endsAt: number | null, now: number): number | null {
  if (startsAt === null || endsAt === null || endsAt <= startsAt) return null;
  return oneDecimal(Math.min(100, Math.max(0, ((now - startsAt) / (endsAt - startsAt)) * 100)));
}

/** 拿到的除以上限 超過算 100 沒有上限時是 null 不畫 */
export function ratioPercent(current: number | null, total: number | null): number | null {
  if (current === null || total === null || total <= 0) return null;
  return oneDecimal(Math.min(100, Math.max(0, (current / total) * 100)));
}
