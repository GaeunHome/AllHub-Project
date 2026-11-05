import { describe, expect, it } from "vitest";
import { dayPartOf, fastestTrain, groupByDayPart } from "../train-groups";

const DATE = "2026-11-05";
const stamp = (clock: string, date = DATE) => Date.parse(`${date}T${clock}:00+08:00`);
const train = (clock: string, ride: number | null = 90, date = DATE) => ({ at: stamp(clock, date), arrivesAt: ride === null ? null : stamp(clock, date) + ride * 60_000, trainNo: clock, kind: null, toward: null });
const summary = (groups: ReturnType<typeof groupByDayPart>) => groups.map(({ part, trains }) => [part, trains.map((departure) => departure.trainNo)]);

describe("dayPartOf：照台北時間的出發時段", () => {
  it.each([
    ["00:10", "早上"],
    ["11:59", "早上"],
    ["12:00", "下午"],
    ["17:59", "下午"],
    ["18:00", "晚上"],
    ["23:30", "晚上"],
  ])("%s 是 %s", (clock, part) => {
    expect(dayPartOf(stamp(clock))).toBe(part);
  });
});

describe("groupByDayPart：查詢結果照時段分組", () => {
  it("使用者要的：早上 下午 晚上", () => {
    expect(summary(groupByDayPart([train("08:00"), train("11:30"), train("12:00"), train("18:30")]))).toEqual([
      ["早上", ["08:00", "11:30"]],
      ["下午", ["12:00"]],
      ["晚上", ["18:30"]],
    ]);
  });

  it("沒有班次的時段不出現", () => {
    expect(summary(groupByDayPart([train("18:00"), train("19:00")]))).toEqual([["晚上", ["18:00", "19:00"]]]);
    expect(groupByDayPart([])).toEqual([]);
  });

  it("跨夜的車排在晚上後面 不能跑到最上面", () => {
    expect(summary(groupByDayPart([train("23:30"), train("00:10", 90, "2026-11-06")]))).toEqual([
      ["晚上", ["23:30"]],
      ["早上", ["00:10"]],
    ]);
  });
});

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
