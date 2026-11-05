import { describe, expect, it, vi } from "vitest";
import { attachDragScroll } from "../drag-scroll";

type Init = { pointerId?: number; pointerType?: string; button?: number; clientX?: number };

/** 只放這個功能會碰到的欄位 clientWidth 300 scrollWidth 500 最多捲 200 */
function setup({ scrollWidth = 500, clientWidth = 300, scrollLeft = 100, inRow = true, onHandle = false } = {}) {
  const row = { scrollLeft, scrollWidth, clientWidth, dataset: {} as DOMStringMap, setPointerCapture: vi.fn() };
  const child = { closest: (selector: string) => (selector === "[data-no-drag-scroll]" ? (onHandle ? child : null) : inRow ? row : null) };
  const root = new EventTarget();
  const fire = (type: string, init: Init = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 0, ...init });
    Object.defineProperty(event, "target", { value: child });
    root.dispatchEvent(event);
    return event;
  };
  const detach = attachDragScroll(root);
  return { row, fire, detach };
}

describe("滑鼠拖曳橫捲", () => {
  it("往左拖就往右捲 拖多少捲多少（從 100 開始 往左拖 80 捲到 180）", () => {
    const { row, fire } = setup();
    fire("pointerdown", { clientX: 200 });
    fire("pointermove", { clientX: 120 });
    expect(row.scrollLeft).toBe(180);
    fire("pointermove", { clientX: 240 });
    expect(row.scrollLeft).toBe(60);
  });

  it("按在拖曳把手上_是拖那一項，整列不跟著捲", () => {
    const { row, fire } = setup({ onHandle: true });
    fire("pointerdown", { clientX: 200 });
    fire("pointermove", { clientX: 120 });
    expect(row.scrollLeft).toBe(100);
  });

  it("捲動量夾在可以捲的範圍裡", () => {
    const { row, fire } = setup();
    fire("pointerdown", { clientX: 500 });
    fire("pointermove", { clientX: 0 });
    expect(row.scrollLeft).toBe(200);
    fire("pointermove", { clientX: 900 });
    expect(row.scrollLeft).toBe(0);
  });

  it("手抖動幾像素不算拖曳 點連結照常換頁", () => {
    const { row, fire } = setup();
    fire("pointerdown", { clientX: 200 });
    fire("pointermove", { clientX: 195 });
    fire("pointerup", { clientX: 195 });
    expect(row.scrollLeft).toBe(100);
    expect(row.setPointerCapture).not.toHaveBeenCalled();
    expect(fire("click").defaultPrevented).toBe(false);
  });

  it("拖過之後放開在連結上不會換頁 而且只擋這一次", () => {
    const { fire } = setup();
    fire("pointerdown", { clientX: 200 });
    fire("pointermove", { clientX: 100 });
    fire("pointerup", { clientX: 100 });
    expect(fire("click").defaultPrevented).toBe(true);
    expect(fire("click").defaultPrevented).toBe(false);
  });

  it("放不下才能拖 放得下時連結要能照常拖到書籤列", () => {
    const { row, fire } = setup({ scrollWidth: 300, clientWidth: 300 });
    fire("pointerdown", { clientX: 200 });
    expect(fire("dragstart").defaultPrevented).toBe(false);
    fire("pointermove", { clientX: 100 });
    expect(row.scrollLeft).toBe(100);
  });

  it("按著的時候瀏覽器不能開始拖連結 不然指標事件會被取消", () => {
    const { fire } = setup();
    fire("pointerdown", { clientX: 200 });
    expect(fire("dragstart").defaultPrevented).toBe(true);
  });

  it("手指本來就能滑 不接手", () => {
    const { row, fire } = setup();
    fire("pointerdown", { clientX: 200, pointerType: "touch" });
    fire("pointermove", { clientX: 100, pointerType: "touch" });
    expect(row.scrollLeft).toBe(100);
  });

  it("只有左鍵能拖", () => {
    const { row, fire } = setup();
    fire("pointerdown", { clientX: 200, button: 2 });
    fire("pointermove", { clientX: 100 });
    expect(row.scrollLeft).toBe(100);
  });

  it("沒有標記的地方不受影響", () => {
    const { row, fire } = setup({ inRow: false });
    fire("pointerdown", { clientX: 200 });
    fire("pointermove", { clientX: 100 });
    expect(row.scrollLeft).toBe(100);
  });

  it("另一隻手指或別的指標動了不算", () => {
    const { row, fire } = setup();
    fire("pointerdown", { clientX: 200 });
    fire("pointermove", { clientX: 100, pointerId: 2 });
    expect(row.scrollLeft).toBe(100);
  });

  it("被系統取消時結束 之後移動不再捲 也不擋下一次點擊", () => {
    const { row, fire } = setup();
    fire("pointerdown", { clientX: 200 });
    fire("pointercancel", { clientX: 200 });
    fire("pointermove", { clientX: 100 });
    expect(row.scrollLeft).toBe(100);
    expect(fire("click").defaultPrevented).toBe(false);
  });

  it("拖曳時有標記 放開就拿掉 游標才會變回來", () => {
    const { row, fire } = setup();
    fire("pointerdown", { clientX: 200 });
    fire("pointermove", { clientX: 100 });
    expect(row.dataset.dragScrolling).toBe("");
    fire("pointerup", { clientX: 100 });
    expect(row.dataset.dragScrolling).toBeUndefined();
  });

  it("卸載後不再處理", () => {
    const { row, fire, detach } = setup();
    detach();
    fire("pointerdown", { clientX: 200 });
    fire("pointermove", { clientX: 100 });
    expect(row.scrollLeft).toBe(100);
  });
});
