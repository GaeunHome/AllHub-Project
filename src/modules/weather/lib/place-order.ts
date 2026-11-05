// 拖曳城市的順序 伺服器與畫面用同一套算法 畫面才能先換好再等回應

export type Slot = { id: number; left: number; width: number };

const centerOf = ({ left, width }: Slot) => left + width / 2;

/** 把 id 放到 beforeId 前面 null 或那一個不在了就放最後 */
export function movedIds(ids: readonly number[], id: number, beforeId: number | null): number[] {
  const rest = ids.filter((value) => value !== id);
  const at = beforeId === null ? -1 : rest.indexOf(beforeId);
  return at === -1 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** 前緣蓋過旁邊那顆的中線就換位 左右一樣靈敏 只看位置所以停著不會來回跳 slots 是拖之前量的 */
export function dragTarget(slots: readonly Slot[], from: number, left: number): number {
  const right = left + slots[from].width;
  for (let index = slots.length - 1; index > from; index--) if (right > centerOf(slots[index])) return index;
  for (let index = 0; index < from; index++) if (left < centerOf(slots[index])) return index;
  return from;
}

/** 首頁縣市固定第一個 所以不能拖過第一顆 也不能拖過最後一顆 */
export function clampDrag(slots: readonly Slot[], from: number, left: number): number {
  const last = slots[slots.length - 1];
  return Math.min(Math.max(left, slots[0].left), last.left + last.width - slots[from].width);
}

/** 排到第 to 個時第 index 顆要讓多少 */
export function shiftAt(slots: readonly Slot[], from: number, to: number, index: number): number {
  const [first, second] = slots;
  const gap = second ? second.left - first.left - first.width : 0;
  const step = slots[from].width + gap;
  if (index > from && index <= to) return -step;
  if (index < from && index >= to) return step;
  return 0;
}

/** 排到第 to 個時放在哪一顆前面 null 是最後 */
export function beforeIdOf(slots: readonly Slot[], from: number, to: number): number | null {
  return slots.filter((_, index) => index !== from)[to]?.id ?? null;
}

/** 鍵盤的左右鍵 已經在最邊邊時回 null */
export function swapTarget(ids: readonly number[], id: number, step: -1 | 1): { beforeId: number | null } | null {
  const at = ids.indexOf(id);
  const to = at + step;
  if (at === -1 || to < 0 || to >= ids.length) return null;
  return { beforeId: step === -1 ? ids[to] : (ids[to + 1] ?? null) };
}
