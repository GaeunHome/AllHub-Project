/** 橫向列加上這個標記 放不下時滑鼠按住就能拖 手指本來就能滑 */
export const DRAG_SCROLL = { "data-drag-scroll": "" } as const;

// 點連結時手會抖幾像素 超過才算拖曳 不然連結點不到
const DRAG_PX = 6;

type Press = { row: HTMLElement; pointerId: number; startX: number; startLeft: number; dragging: boolean };

/** 掛在 document 整站一組監聽 列在串流或 Activity 裡換掉也不用重掛 */
export function attachDragScroll(root: EventTarget): () => void {
  let press: Press | null = null;

  const begin = (event: Event) => {
    const { pointerType, button, target, pointerId, clientX } = event as PointerEvent;
    if (pointerType !== "mouse" || button !== 0) return;
    const row = (target as Element).closest?.<HTMLElement>("[data-drag-scroll]");
    if (!row || row.scrollWidth <= row.clientWidth) return;
    press = { row, pointerId, startX: clientX, startLeft: row.scrollLeft, dragging: false };
  };

  const move = (event: Event) => {
    const { pointerId, clientX } = event as PointerEvent;
    if (press?.pointerId !== pointerId) return;
    const { row, startX, startLeft } = press;
    const moved = clientX - startX;
    if (!press.dragging) {
      if (Math.abs(moved) < DRAG_PX) return;
      press.dragging = true;
      // 過了門檻才抓住指標 太早抓的話點連結時 click 會落在外框上
      row.setPointerCapture(pointerId);
      row.dataset.dragScrolling = "";
    }
    row.scrollLeft = Math.min(Math.max(startLeft - moved, 0), row.scrollWidth - row.clientWidth);
  };

  const swallowClick = () => {
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    root.addEventListener("click", swallow, { capture: true, once: true });
    // 放開的地方跟按下的不同時瀏覽器不會送 click 下一次真的點擊不能被吃掉
    setTimeout(() => root.removeEventListener("click", swallow, { capture: true }));
  };

  const release = (event: Event, swallow: boolean) => {
    if (press?.pointerId !== (event as PointerEvent).pointerId) return;
    const { row, dragging } = press;
    press = null;
    delete row.dataset.dragScrolling;
    if (dragging && swallow) swallowClick();
  };
  const end = (event: Event) => release(event, true);
  const cancel = (event: Event) => release(event, false);

  // 瀏覽器開始拖連結就會取消指標事件 接著就捲不動了
  const blockNativeDrag = (event: Event) => {
    if (press) event.preventDefault();
  };

  root.addEventListener("pointerdown", begin);
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", cancel);
  root.addEventListener("dragstart", blockNativeDrag);
  return () => {
    root.removeEventListener("pointerdown", begin);
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerup", end);
    root.removeEventListener("pointercancel", cancel);
    root.removeEventListener("dragstart", blockNativeDrag);
  };
}
