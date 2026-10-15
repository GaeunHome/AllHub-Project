import { formatTwd } from "../../../lib/money";

// 不碰 DOM 與 React 幀由呼叫端提供 測試才能一幀一幀檢查

export const COUNT_UP_MS = 800;

/** 畫面上的數字都是新台幣金額 */
export function formatCount(value: number): string {
  return formatTwd(value);
}

export function easeOutCubic(t: number): number {
  const progress = Math.min(1, Math.max(0, t));
  return 1 - (1 - progress) ** 3;
}

/** 中間的數字四捨五入成整數元 跳動時才不會出現小數 */
export function tween(from: number, to: number, elapsed: number, duration = COUNT_UP_MS): number {
  if (elapsed >= duration) return to;
  if (elapsed <= 0) return from;
  return Math.round(from + (to - from) * easeOutCubic(elapsed / duration));
}

/**
 * shown 是畫面上顯示到多少 null 是第一次出現 從 0 開始
 * revealed 是 CSS 的備援已經顯示最後的數字 不倒回 0
 */
export function countUpStart(shown: number | null, value: number, revealed = false): number {
  if (shown !== null) return shown;
  return revealed ? value : 0;
}

export type FrameApi = { request: (callback: (time: number) => void) => number; cancel: (id: number) => void };

type CountUpOptions = { from: number; to: number; duration?: number; write: (value: number) => void; frames: FrameApi };

/** 時間到了停在終點 回傳的取消函式給卸載或 Activity 藏起來時呼叫 */
export function countUp({ from, to, duration = COUNT_UP_MS, write, frames }: CountUpOptions): () => void {
  if (from === to) {
    write(to);
    return () => {};
  }
  let start: number | null = null;
  const step = (time: number) => {
    start ??= time;
    const elapsed = time - start;
    write(tween(from, to, elapsed, duration));
    if (elapsed < duration) id = frames.request(step);
  };
  let id = frames.request(step);
  return () => frames.cancel(id);
}
