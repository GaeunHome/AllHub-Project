import { describe, expect, it, vi } from "vitest";
import { startRouteDrag } from "../route-drag";

// 在瀏覽器發現過 卡片換位置時 React 搬動元素 指標捕捉被放掉
// 只聽把手時放開收不到 順序存不了 所以聽整個視窗

// 其他卡片的中線 1 在 100 2 在 300
const MIDDLES: Record<number, number> = { 1: 100, 2: 300, 3: 500 };

const pointer = (type: string, pointerId: number, clientY = 0) => Object.assign(new Event(type), { pointerId, clientY });
const key = (name: string) => Object.assign(new Event("keydown", { cancelable: true }), { key: name });

function drag(window: EventTarget) {
  const done = vi.fn<(order: number[] | null) => void>();
  const reorder = vi.fn<(order: number[]) => void>();
  startRouteDrag(window, { id: 3, pointerId: 7, order: [1, 2, 3] }, { middles: (others) => others.map((id) => MIDDLES[id]), reorder, follow: () => {}, done });
  return { done, reorder };
}

describe("側邊欄常用路線的拖曳（使用者要的：可以上下拖曳排順序）", () => {
  it("把手收不到任何事件（卡片被搬走、指標捕捉被放掉）_視窗上的移動與放開照樣存成新的順序", () => {
    const window = new EventTarget();
    const { done, reorder } = drag(window);

    window.dispatchEvent(pointer("pointermove", 7, 50));
    window.dispatchEvent(pointer("pointerup", 7, 50));

    expect(reorder).toHaveBeenLastCalledWith([3, 1, 2]);
    expect(done).toHaveBeenCalledExactlyOnceWith([3, 1, 2]);
  });

  it("別的手指的移動與放開不算：拖著的那一隻放開才存", () => {
    const window = new EventTarget();
    const { done } = drag(window);

    window.dispatchEvent(pointer("pointermove", 8, 50));
    window.dispatchEvent(pointer("pointerup", 8, 50));
    expect(done).not.toHaveBeenCalled();

    window.dispatchEvent(pointer("pointermove", 7, 200));
    window.dispatchEvent(pointer("pointerup", 7, 200));
    expect(done).toHaveBeenCalledExactlyOnceWith([1, 3, 2]);
  });

  it("按 Esc 或系統取消（pointercancel）_不存，之後的移動與放開也不算", () => {
    for (const cancel of [key("Escape"), pointer("pointercancel", 7)]) {
      const window = new EventTarget();
      const { done, reorder } = drag(window);
      window.dispatchEvent(pointer("pointermove", 7, 50));

      window.dispatchEvent(cancel);
      window.dispatchEvent(pointer("pointermove", 7, 600));
      window.dispatchEvent(pointer("pointerup", 7, 600));

      expect(done).toHaveBeenCalledExactlyOnceWith(null);
      expect(reorder).toHaveBeenCalledTimes(1);
    }
  });
});
