import { sameOrder } from "@/core/order";
import { dropIndex } from "./route-sort";

// 拖曳中聽整個視窗 不聽把手
// 卡片換位置時 React 會搬動元素 把手上的指標捕捉會被放掉 放開就收不到

type PointerLike = Event & { pointerId: number; clientY: number };

export type DragHooks = {
  /** 其他卡片目前的中線 照傳進來的順序 手指靠近邊緣時先捲再量 */
  middles: (others: readonly number[], pointerY: number) => number[];
  /** 順序變了 畫面跟著換 */
  reorder: (order: number[]) => void;
  /** 每次移動之後 卡片跟著手指 */
  follow: (pointerY: number) => void;
  /** 放開時給最後的順序 按 Esc 或被系統取消時給 null */
  done: (order: number[] | null) => void;
};

/** 開始拖曳 回傳停止監聽的函式 卸載時用 */
export function startRouteDrag(window: EventTarget, start: { id: number; pointerId: number; order: readonly number[] }, hooks: DragHooks): () => void {
  let order = [...start.order];
  const own = (event: Event) => (event as PointerLike).pointerId === start.pointerId;

  const onMove = (event: Event) => {
    if (!own(event)) return;
    const pointerY = (event as PointerLike).clientY;
    const others = order.filter((id) => id !== start.id);
    const at = dropIndex(hooks.middles(others, pointerY), pointerY);
    const next = [...others.slice(0, at), start.id, ...others.slice(at)];
    if (!sameOrder(next, order)) {
      order = next;
      hooks.reorder(next);
    }
    hooks.follow(pointerY);
  };
  const finish = (cancel: boolean) => {
    stop();
    hooks.done(cancel ? null : order);
  };
  const onUp = (event: Event) => {
    if (own(event)) finish(event.type === "pointercancel");
  };
  const onKey = (event: Event) => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    event.preventDefault();
    finish(true);
  };
  const stop = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    window.removeEventListener("keydown", onKey);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("keydown", onKey);
  return stop;
}
