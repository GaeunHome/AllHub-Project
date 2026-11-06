// 城市的順序 伺服器與畫面用同一套算法 畫面才能先換好再等回應

/** 首頁選的縣市不算在內 */
export const PLACE_LIMIT = 10;

/** 把 id 放到 beforeId 前面 null 或那一個不在了就放最後 */
export function movedIds(ids: readonly number[], id: number, beforeId: number | null): number[] {
  const rest = ids.filter((value) => value !== id);
  const at = beforeId === null ? -1 : rest.indexOf(beforeId);
  return at === -1 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** 上移下移 已經在最邊邊時回 null */
export function swapTarget(ids: readonly number[], id: number, step: -1 | 1): { beforeId: number | null } | null {
  const at = ids.indexOf(id);
  const to = at + step;
  if (at === -1 || to < 0 || to >= ids.length) return null;
  return { beforeId: step === -1 ? ids[to] : (ids[to + 1] ?? null) };
}
