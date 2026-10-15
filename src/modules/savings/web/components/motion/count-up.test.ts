import { describe, expect, it, vi } from "vitest";
import { COUNT_UP_MS, countUp, countUpStart, easeOutCubic, tween } from "./count-up";

/** 假的 requestAnimationFrame 測試自己決定每一幀的時間 */
function fakeFrames() {
  let queue: { id: number; callback: (time: number) => void }[] = [];
  let nextId = 1;
  return {
    request: vi.fn((callback: (time: number) => void) => {
      const id = nextId++;
      queue.push({ id, callback });
      return id;
    }),
    cancel: vi.fn((id: number) => {
      queue = queue.filter((frame) => frame.id !== id);
    }),
    /** 跑這一幀排進來的 callback 裡面再排的下一幀留到下次 */
    tick(time: number) {
      const due = queue;
      queue = [];
      for (const frame of due) frame.callback(time);
    },
    pending: () => queue.length,
  };
}

describe("數字往上數的節奏", () => {
  it("ease-out：一開始快、接近終點變慢，頭尾固定在 0 與 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("中間的數字是整數元，時間到了就是最後的數字", () => {
    expect(tween(0, 43000, 0)).toBe(0);
    expect(tween(0, 43000, COUNT_UP_MS / 2)).toBe(37625);
    expect(tween(0, 43000, COUNT_UP_MS)).toBe(43000);
    expect(tween(0, 43000, COUNT_UP_MS * 3)).toBe(43000);
    expect(Number.isInteger(tween(0, 999, 123))).toBe(true);
  });

  it("數值改變時從畫面上的數字接著跑；數值沒變又重新跑（Activity 再顯示）時不重播，直接是最後的數字", () => {
    expect(countUpStart(0, 52000)).toBe(0);
    expect(countUpStart(52000, 61000)).toBe(52000);
    expect(countUpStart(52000, 52000)).toBe(52000);
  });
});

describe("每一幀寫一次數字", () => {
  it("從起點數到終點：每一幀都寫，數字只增不減，最後一定停在終點、不再要下一幀", () => {
    const frames = fakeFrames();
    const write = vi.fn();

    countUp({ from: 0, to: 43000, write, frames });
    for (let time = 1000; frames.pending() > 0 && time < 3000; time += 16) frames.tick(time);

    const written = write.mock.calls.map(([value]) => value as number);
    expect(written[0]).toBe(0);
    expect(written.at(-1)).toBe(43000);
    expect(written.every((value, i) => i === 0 || value >= written[i - 1])).toBe(true);
    expect(written.length).toBeGreaterThan(40);
    expect(frames.pending()).toBe(0);
  });

  it("往下數（數值變小）也一樣平順，停在新的數字", () => {
    const frames = fakeFrames();
    const write = vi.fn();

    countUp({ from: 5000, to: 1200, write, frames });
    for (let time = 0; frames.pending() > 0 && time < 3000; time += 16) frames.tick(time);

    const written = write.mock.calls.map(([value]) => value as number);
    expect(written.every((value, i) => i === 0 || value <= written[i - 1])).toBe(true);
    expect(written.at(-1)).toBe(1200);
  });

  it("取消後（卸載、Activity 藏起來）不再寫，也不留下排好的幀", () => {
    const frames = fakeFrames();
    const write = vi.fn();

    const cancel = countUp({ from: 0, to: 1000, write, frames });
    frames.tick(0);
    frames.tick(100);
    cancel();
    const writes = write.mock.calls.length;
    frames.tick(200);

    expect(write).toHaveBeenCalledTimes(writes);
    expect(frames.pending()).toBe(0);
  });

  it("起點就是終點：直接寫上去，不排任何一幀", () => {
    const frames = fakeFrames();
    const write = vi.fn();

    countUp({ from: 800, to: 800, write, frames });

    expect(write).toHaveBeenCalledExactlyOnceWith(800);
    expect(frames.request).not.toHaveBeenCalled();
  });
});
