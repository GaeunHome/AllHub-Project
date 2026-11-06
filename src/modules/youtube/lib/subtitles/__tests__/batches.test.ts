import { describe, expect, it } from "vitest";
import { pickNextBatch } from "../batches";

describe("pickNextBatch", () => {
  // 每句 3 秒 第 i 句在 i*3 秒出現 2.5 秒後消失
  const timed = (n: number, text = "가") => Array.from({ length: n }, (_, i) => ({ start: i * 3000, end: i * 3000 + 2500, text }));
  /** 指定範圍已翻好 end 不含 其餘是 null */
  const translated = (n: number, ...done: [number, number][]) =>
    Array.from({ length: n }, (_, i) => (done.some(([start, end]) => i >= start && i < end) ? "中" : null));

  it("沒有播放位置 → 從頭依序，每批最多 30 句", () => {
    expect(pickNextBatch(timed(130), translated(130))).toEqual({ start: 0, end: 30 });
    expect(pickNextBatch(timed(130), translated(130, [0, 30]))).toEqual({ start: 30, end: 60 });
  });

  it("全部翻完 → null", () => {
    expect(pickNextBatch(timed(5), translated(5, [0, 5]))).toBeNull();
    expect(pickNextBatch(timed(5), translated(5, [0, 5]), 3000)).toBeNull();
  });

  it("播放位置那一句還沒翻 → 從那一句開始，第一段只翻 10 句", () => {
    expect(pickNextBatch(timed(130), translated(130), 60_500)).toEqual({ start: 20, end: 30 });
  });

  it("播放位置在兩句之間 → 從下一句開始", () => {
    expect(pickNextBatch(timed(130), translated(130), 62_700)).toEqual({ start: 21, end: 31 });
  });

  it("馬上要播的都翻好了 → 播放位置前方還沒翻的用正常大小", () => {
    expect(pickNextBatch(timed(130), translated(130, [20, 30]), 61_000)).toEqual({ start: 30, end: 60 });
  });

  it("15 秒內就會播到還沒翻的句子 → 仍用小批次", () => {
    // 播到第 27 句 第 30 句 9 秒後出現
    expect(pickNextBatch(timed(130), translated(130, [20, 30]), 81_000)).toEqual({ start: 30, end: 40 });
  });

  it("一批只包含連續還沒翻的句子，遇到已翻好的就停，不重翻", () => {
    expect(pickNextBatch(timed(130), translated(130, [25, 30]), 60_500)).toEqual({ start: 20, end: 25 });
  });

  it("播放位置前方約 2 分半都翻好了 → 從頭依序補，不是接著往後", () => {
    // 60 秒播到第 20 句 前方到 222 秒的第 74 句都翻好
    expect(pickNextBatch(timed(130), translated(130, [20, 75]), 60_500)).toEqual({ start: 0, end: 20 });
  });

  it("從頭補完後接著補播放位置前方 2 分半以外的部分", () => {
    expect(pickNextBatch(timed(130), translated(130, [0, 75]), 60_500)).toEqual({ start: 75, end: 105 });
  });

  it("播放位置在最後一句之後 → 從頭依序補", () => {
    expect(pickNextBatch(timed(10), translated(10, [5, 10]), 999_999)).toEqual({ start: 0, end: 5 });
  });

  it("字數達上限就切批，單句超過上限也自成一批", () => {
    expect(pickNextBatch(timed(50, "가".repeat(150)), translated(50))).toEqual({ start: 0, end: 20 });
    expect(pickNextBatch(timed(3, "가".repeat(5000)), translated(3), 0)).toEqual({ start: 0, end: 1 });
  });
});
