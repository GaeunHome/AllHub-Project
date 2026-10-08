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
});
