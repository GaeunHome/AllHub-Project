import { describe, expect, it } from "vitest";
import { fastestTrain } from "../fastest-train";

const DATE = "2026-11-05";
const stamp = (clock: string, date = DATE) => Date.parse(`${date}T${clock}:00+08:00`);
const train = (clock: string, ride: number | null = 90, date = DATE) => ({ at: stamp(clock, date), arrivesAt: ride === null ? null : stamp(clock, date) + ride * 60_000, trainNo: clock, kind: null, toward: null });

describe("fastestTrain：最快的一班", () => {
  it("使用者要的：坐得最久的不算 只標最短的一班", () => {
    const fast = train("18:30", 220);

    expect(fastestTrain([train("18:00", 270), fast])).toBe(fast);
  });

  it("一樣短時標比較早的", () => {
    const early = train("09:00", 100);

    expect(fastestTrain([train("08:00", 120), early, train("10:00", 100)])).toBe(early);
  });

  it("每班都一樣久就沒有最快", () => {
    expect(fastestTrain([train("08:00", 94), train("09:00", 94), train("10:00", 94)])).toBeNull();
  });

  it("只有一班不用比", () => {
    expect(fastestTrain([train("08:00", 94)])).toBeNull();
    expect(fastestTrain([])).toBeNull();
  });

  it("不知道幾點到的不算 剩一班有時間時也沒得比", () => {
    expect(fastestTrain([train("08:00", null), train("09:00", 94)])).toBeNull();
  });

  it("跨午夜的車程照實際分鐘算", () => {
    const overnight = { at: stamp("23:50"), arrivesAt: stamp("00:20", "2026-11-06"), trainNo: "1", kind: null, toward: null };

    expect(fastestTrain([train("20:00", 60), overnight])).toBe(overnight);
  });
});
