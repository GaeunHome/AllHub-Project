// Activity 把頁面藏起來再顯示時 display 從 none 回來會讓 CSS 動畫重播
// 所以藏起來時先標成播過 再顯示時 CSS 看到標記就不播 之後才出現的照常播

/** globals.css 裡配 data-entered 的選擇器要列同一份 */
const ENTRANCE_CLASSES = ["fin-rise", "fin-reveal", "fin-donut-arc", "fin-progress-fill", "fin-bar", "fin-line"] as const;

const ENTERED = "data-entered";
/** 達到目標的進度條亮過了 之後才達到目標的沒標 還會亮一次 */
const GLOWED = "data-glowed";

const SELECTOR = ENTRANCE_CLASSES.map((name) => `.${name}`).join(",");
const REACHED = ".fin-progress-fill[data-reached]";

type Marked = { setAttribute(name: string, value: string): void; matches(selector: string): boolean };
type Root = { querySelectorAll(selector: string): Iterable<Marked> };

function markEntered(root: Root): void {
  for (const element of root.querySelectorAll(SELECTOR)) {
    element.setAttribute(ENTERED, "");
    if (element.matches(REACHED)) element.setAttribute(GLOWED, "");
  }
}

type Timers = { set: (callback: () => void) => number; clear: (id: number) => void };

/**
 * 清除函式排到下一個工作才標記 StrictMode 在同一個工作裡模擬卸載再掛上
 * 再掛上時取消 一進來的進場動畫才不會馬上被停掉
 */
export function entranceMemory(timers: Timers) {
  let pending: number | null = null;
  return {
    mount() {
      if (pending === null) return;
      timers.clear(pending);
      pending = null;
    },
    hide(root: Root) {
      pending = timers.set(() => {
        pending = null;
        markEntered(root);
      });
    },
  };
}
