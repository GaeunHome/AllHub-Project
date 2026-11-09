import { describe, expect, it, vi } from "vitest";
import { createGate, whenOpen } from "../search-gate";

describe("整頁載入時常用路線等查詢先問 TDX（每分鐘只有 5 次）", () => {
  it("查詢問完就放行", async () => {
    const gate = createGate();
    let passed = false;
    const waiting = whenOpen(gate).then(() => (passed = true));

    await Promise.resolve();
    expect(passed).toBe(false);
    gate.open();
    await waiting;
    expect(passed).toBe(true);
  });

  it("一直沒等到查詢也會放行：常用路線不能永遠卡住", async () => {
    vi.useFakeTimers();
    try {
      let passed = false;
      const waiting = whenOpen(createGate()).then(() => (passed = true));

      await vi.advanceTimersByTimeAsync(30_000);
      await waiting;
      expect(passed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
