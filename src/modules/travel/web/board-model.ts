import type { TripItem } from "../service/trips";

export type Move = { itemId: number; toDay: string | null; beforeId: number | null };

const byPosition = (a: TripItem, b: TripItem) => a.position - b.position || a.id - b.id;

export const itemsOfDay = (items: readonly TripItem[], day: string | null) => items.filter((item) => item.day === day).sort(byPosition);

/** 放開時畫面先換好 等伺服器回來 算法要跟 service 的 moveItem 一樣 */
export function moveInBoard(items: readonly TripItem[], { itemId, toDay, beforeId }: Move): TripItem[] {
  const moving = items.find((item) => item.id === itemId);
  if (!moving) return [...items];
  const target = itemsOfDay(items, toDay).filter((item) => item.id !== itemId);
  const index = beforeId === null ? -1 : target.findIndex((item) => item.id === beforeId);
  target.splice(index === -1 ? target.length : index, 0, { ...moving, day: toDay });
  const placed = new Map(target.map((item, position) => [item.id, { ...item, position }]));
  return items.map((item) => placed.get(item.id) ?? item);
}

/** 上移下移是拖曳的替代方式 鍵盤與手機都用得到 回傳放在哪一項前面 到頭了回 undefined */
export function neighbourMove(items: readonly TripItem[], itemId: number, direction: -1 | 1): Move | undefined {
  const moving = items.find((item) => item.id === itemId);
  if (!moving) return undefined;
  const list = itemsOfDay(items, moving.day);
  const index = list.findIndex((item) => item.id === itemId);
  const next = index + direction;
  if (next < 0 || next >= list.length) return undefined;
  const others = list.filter((item) => item.id !== itemId);
  return { itemId, toDay: moving.day, beforeId: others[next]?.id ?? null };
}

/** 放回原位時不送出 不然白白通知同行的人 算法要跟 service 的 moveItem 一樣 */
export function isSamePlace(items: readonly TripItem[], { itemId, toDay, beforeId }: Move): boolean {
  const moving = items.find((item) => item.id === itemId);
  if (!moving || moving.day !== toDay) return false;
  const list = itemsOfDay(items, toDay);
  const others = list.filter((item) => item.id !== itemId);
  const index = beforeId === null ? -1 : others.findIndex((item) => item.id === beforeId);
  return list.findIndex((item) => item.id === itemId) === (index === -1 ? others.length : index);
}

export type CardBox = { id: number; top: number; height: number };

/** 落在一項的上半部就放它前面 比全部都低就放最後 回傳 null */
export function beforeIdAt(cards: readonly CardBox[], y: number): number | null {
  return cards.find((card) => y < card.top + card.height / 2)?.id ?? null;
}

/** 方向鍵左右 移到旁邊那一排的最後 */
export function adjacentListMove(items: readonly TripItem[], lists: readonly (string | null)[], itemId: number, direction: -1 | 1): Move | undefined {
  const moving = items.find((item) => item.id === itemId);
  if (!moving) return undefined;
  const next = lists.indexOf(moving.day) + direction;
  return next < 0 || next >= lists.length ? undefined : { itemId, toDay: lists[next], beforeId: null };
}
