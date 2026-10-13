import { describe, expect, it } from "vitest";
import { findCueIndex } from "./cue-lookup";

const cues = [
  { start: 1000, end: 2000 },
  { start: 2000, end: 3500 },
  { start: 5000, end: 6000 },
];

describe("findCueIndex", () => {
  it.each([
    [0, -1],
    [999, -1],
    [1000, 0],
    [1999, 0],
    [2000, 1],
    [3499, 1],
    [3500, -1],
    [4000, -1],
    [5500, 2],
    [6000, -1],
    [99999, -1],
  ])("%d ms → %d", (ms, expected) => {
    expect(findCueIndex(cues, ms)).toBe(expected);
  });

  it("空陣列 → -1", () => {
    expect(findCueIndex([], 100)).toBe(-1);
  });

  it("時間重疊時取開始時間最晚、仍涵蓋的那句", () => {
    expect(findCueIndex([{ start: 0, end: 5000 }, { start: 1000, end: 2000 }], 1500)).toBe(1);
    expect(findCueIndex([{ start: 0, end: 5000 }, { start: 1000, end: 2000 }], 3000)).toBe(0);
  });

  it("很長的一句中間夾了很多短句：短句都結束後，仍回到那句長的（不限制只往前找幾句）", () => {
    const shorts = Array.from({ length: 8 }, (_, i) => ({ start: 1000 + i * 500, end: 1400 + i * 500 }));
    const withLong = [{ start: 0, end: 60_000 }, ...shorts];

    expect(findCueIndex(withLong, 1200)).toBe(1);
    expect(findCueIndex(withLong, 20_000)).toBe(0);
    expect(findCueIndex(withLong, 60_000)).toBe(-1);
  });

  it("開始時間相同的兩句：取後面那句", () => {
    expect(findCueIndex([{ start: 1000, end: 3000 }, { start: 1000, end: 2000 }], 1500)).toBe(1);
    expect(findCueIndex([{ start: 1000, end: 3000 }, { start: 1000, end: 2000 }], 2500)).toBe(0);
  });

  it("長度是 0 的句子永遠不顯示", () => {
    expect(findCueIndex([{ start: 1000, end: 1000 }], 1000)).toBe(-1);
  });
});

describe("findCueIndex：bridgeGapMs 把很短的空檔接起來，換句時字幕不會閃一下", () => {
  // 第一句與第二句之間空 100ms，第二句與第三句之間空 1 秒
  const spaced = [
    { start: 1000, end: 2000 },
    { start: 2100, end: 3000 },
    { start: 4000, end: 5000 },
  ];

  it("空檔不超過 bridgeGapMs：繼續顯示上一句，下一句一開始就換", () => {
    expect(findCueIndex(spaced, 2000, { bridgeGapMs: 250 })).toBe(0);
    expect(findCueIndex(spaced, 2099, { bridgeGapMs: 250 })).toBe(0);
    expect(findCueIndex(spaced, 2100, { bridgeGapMs: 250 })).toBe(1);
  });

  it("空檔剛好等於 bridgeGapMs 也接起來；超過就照常留白", () => {
    expect(findCueIndex(spaced, 2050, { bridgeGapMs: 100 })).toBe(0);
    expect(findCueIndex(spaced, 2050, { bridgeGapMs: 99 })).toBe(-1);
    expect(findCueIndex(spaced, 3500, { bridgeGapMs: 250 })).toBe(-1);
  });

  it("最後一句之後、第一句之前不接", () => {
    expect(findCueIndex(spaced, 5100, { bridgeGapMs: 250 })).toBe(-1);
    expect(findCueIndex(spaced, 900, { bridgeGapMs: 250 })).toBe(-1);
  });

  it("重疊的句子結束後：接的是最晚結束的那句", () => {
    const overlapped = [
      { start: 0, end: 3000 },
      { start: 1000, end: 2000 },
      { start: 3100, end: 4000 },
    ];

    expect(findCueIndex(overlapped, 3050, { bridgeGapMs: 250 })).toBe(0);
  });

  it("長度是 0 的句子在空檔裡也不顯示：接起來的是前面真的顯示過的那句；前面沒有就留白", () => {
    const withEmpty = [
      { start: 1000, end: 2000 },
      { start: 2050, end: 2050 },
      { start: 2100, end: 3000 },
    ];

    expect(findCueIndex(withEmpty, 2060, { bridgeGapMs: 250 })).toBe(0);
    expect(findCueIndex([{ start: 1000, end: 1000 }, { start: 1100, end: 2000 }], 1050, { bridgeGapMs: 250 })).toBe(-1);
  });

  it("沒有給 bridgeGapMs：空檔一律留白（下載、翻譯位置這類要精確的用途）", () => {
    expect(findCueIndex(spaced, 2050)).toBe(-1);
  });
});
