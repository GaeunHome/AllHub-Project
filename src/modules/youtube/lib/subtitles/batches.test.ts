import { describe, expect, it } from "vitest";
import { countCompletedBatches, pickNextBatch, planBatches } from "./batches";

const cue = (text: string, i = 0) => ({ start: i * 1000, end: i * 1000 + 900, text });

describe("planBatches", () => {
  it("空字幕 → 沒有批次", () => {
    expect(planBatches([])).toEqual([]);
  });

  it("預設每批最多 30 句", () => {
    const cues = Array.from({ length: 130 }, (_, i) => cue("가", i));
    expect(planBatches(cues)).toEqual([
      { start: 0, end: 30 },
      { start: 30, end: 60 },
      { start: 60, end: 90 },
      { start: 90, end: 120 },
      { start: 120, end: 130 },
    ]);
  });

  it("字數達上限就切批", () => {
    const cues = Array.from({ length: 5 }, (_, i) => cue("가".repeat(40), i));
    expect(planBatches(cues, 60, 100)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 5 },
    ]);
  });

  it("單句就超過字數上限時自成一批，不會卡住", () => {
    const cues = [cue("가".repeat(500), 0), cue("나", 1)];
    expect(planBatches(cues, 60, 100)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
    ]);
  });

  it("批次連續、涵蓋全部句子", () => {
    const cues = Array.from({ length: 97 }, (_, i) => cue("문장".repeat((i % 7) + 1), i));
    const batches = planBatches(cues, 10, 50);
    expect(batches[0].start).toBe(0);
    expect(batches.at(-1)!.end).toBe(97);
    batches.slice(1).forEach((b, i) => expect(b.start).toBe(batches[i].end));
  });
});

describe("pickNextBatch", () => {
  // 每句 3 秒：第 i 句在 i*3 秒出現、2.5 秒後消失
  const timed = (n: number, text = "가") => Array.from({ length: n }, (_, i) => ({ start: i * 3000, end: i * 3000 + 2500, text }));
  /** 指定範圍（end 不含）已翻好，其餘是 null */
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
    // 播到第 27 句，第 30 句 9 秒後出現
    expect(pickNextBatch(timed(130), translated(130, [20, 30]), 81_000)).toEqual({ start: 30, end: 40 });
  });

  it("一批只包含連續還沒翻的句子，遇到已翻好的就停，不重翻", () => {
    expect(pickNextBatch(timed(130), translated(130, [25, 30]), 60_500)).toEqual({ start: 20, end: 25 });
  });

  it("播放位置前方約 2 分半都翻好了 → 從頭依序補，不是接著往後", () => {
    // 播到第 20 句（60 秒），前方到第 74 句（222 秒）都翻好
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

describe("countCompletedBatches", () => {
  const batches = [
    { start: 0, end: 2 },
    { start: 2, end: 4 },
    { start: 4, end: 5 },
  ];

  it("從第一批算起，連續全部翻好的批數", () => {
    expect(countCompletedBatches(batches, [null, "b", "c", "d", "e"])).toBe(0);
    expect(countCompletedBatches(batches, ["a", "b", null, "d", "e"])).toBe(1);
    expect(countCompletedBatches(batches, ["a", "b", "c", "d", "e"])).toBe(3);
  });
});
