// 按鈕或那一列不見時 焦點移到外框 不能掉到 body
// 外框展開 FOCUS_FRAME 會不見的元素把 keepFocusInFrame 當 ref

const FRAME = "[data-focus-frame]";

/**
 * 展開在不會消失的外框上 例如卡片 區塊與頁面的 main
 * tabIndex -1 讓程式放得了焦點 Tab 不會停在這裡
 */
export const FOCUS_FRAME = { "data-focus-frame": "", tabIndex: -1 } as const;

/**
 * 由近到遠的每一層外框 要在拿掉之前找 拿掉之後就往上找不到了
 * 最近的那一層也一起被拿掉時改用外面還在的 最外面是 main
 */
export function framesOf(node: Element | null): HTMLElement[] {
  const frames: HTMLElement[] = [];
  for (let frame = node?.closest<HTMLElement>(FRAME) ?? null; frame; frame = frame.parentElement?.closest<HTMLElement>(FRAME) ?? null) frames.push(frame);
  return frames;
}

/** 這次更新做完後焦點掉到 body 才移到還在的外框 不捲動頁面 */
export function focusFrameIfLost(frames: readonly HTMLElement[]): void {
  if (frames.length === 0) return;
  queueMicrotask(() => {
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    frames.find((frame) => frame.isConnected)?.focus({ preventScroll: true });
  });
}

/** 當 ref 用 帶著焦點被拿掉時把焦點交給外框 */
export function keepFocusInFrame(node: HTMLElement | null) {
  if (!node) return;
  return () => {
    if (node.contains(document.activeElement)) focusFrameIfLost(framesOf(node));
  };
}
