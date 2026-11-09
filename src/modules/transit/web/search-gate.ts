import { cache } from "react";

// 整頁載入時 layout 的我的路線與 page 的查詢同時開始算 TDX 每分鐘只有 5 次 常用路線等查詢先問
// 只換網址參數時 layout 不重算 不會等到這裡

/** 等太久就放行 正常不會等到 只是保險 */
const GATE_TIMEOUT_MS = 10_000;

export type SearchGate = { open: () => void; done: Promise<void> };

export function createGate(): SearchGate {
  let open = () => {};
  const done = new Promise<void>((resolve) => (open = resolve));
  return { open, done };
}

/** 同一次請求共用一個 layout 等 page 打開 */
export const searchGate = cache(createGate);

export const whenOpen = (gate: SearchGate) => Promise.race([gate.done, new Promise<void>((resolve) => setTimeout(resolve, GATE_TIMEOUT_MS))]);
