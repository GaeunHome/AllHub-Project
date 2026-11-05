import { describe, expect, it } from "vitest";
import { countdownText, shouldReadLive, upcoming, withLive } from "../countdown";
import { parseMetroEstimate, parseTraDelays } from "../live";

const NOW = Date.parse("2026-11-05T08:00:00+08:00");
const min = (minutes: number) => NOW + minutes * 60_000;
const train = (minutes: number, trainNo: string | null = null) => ({ at: min(minutes), arrivesAt: null, trainNo, kind: null, toward: null });

describe("countdownText：看板上的倒數", () => {
  it.each([
    [750, "12 分 30 秒"],
    [59, "59 秒"],
    [3600, "1 小時 0 分"],
    [3990, "1 小時 6 分"],
    [0, "進站中"],
    [-5, "進站中"],
  ])("%i 秒_%s", (seconds, text) => {
    expect(countdownText(seconds * 1000)).toBe(text);
  });
});

describe("upcoming：接下來的班次", () => {
  it("開過的不列 照時間排", () => {
    expect(upcoming([train(5), train(-1), train(2)], NOW).map((item) => item.at)).toEqual([min(2), min(5)]);
  });
});

describe("withLive：用即時資料校正時刻表", () => {
  it("台鐵誤點 5 分鐘_開車時間往後 5 分鐘", () => {
    const [first] = withLive([train(10, "123")], { kind: "delays", delays: { "123": 5 } }, NOW);

    expect(first.at).toBe(min(15));
  });

  it("表訂已經過了但還在誤點_這班還沒開 繼續列", () => {
    expect(withLive([train(-2, "123")], { kind: "delays", delays: { "123": 5 } }, NOW).map((item) => item.at)).toEqual([min(3)]);
  });

  it("沒有誤點資料的班次照時刻表 不是每一班都在看板上", () => {
    expect(withLive([train(10, "123"), train(40, "456")], { kind: "delays", delays: { "123": 5 } }, NOW).map((item) => item.at)).toEqual([min(15), min(40)]);
  });

  it("誤點後順序可能換 照校正後的時間排", () => {
    expect(withLive([train(10, "A"), train(12, "B")], { kind: "delays", delays: { A: 5 } }, NOW).map((item) => item.trainNo)).toEqual(["B", "A"]);
  });

  it("捷運預估 3 分鐘_下一班改成讀到資料那時候算起 3 分鐘", () => {
    const [first, second] = withLive([train(1), train(9)], { kind: "estimate", seconds: 180, readAt: NOW }, NOW);

    expect(first.at).toBe(min(3));
    expect(second.at).toBe(min(9));
  });

  it("捷運校正後比後面的班次還晚_那幾班不列 文湖線沒有時刻表也有一班", () => {
    expect(withLive([train(1), train(2)], { kind: "estimate", seconds: 180, readAt: NOW }, NOW).map((item) => item.at)).toEqual([min(3)]);
    expect(withLive([], { kind: "estimate", seconds: 180, readAt: NOW }, NOW).map((item) => item.at)).toEqual([min(3)]);
  });

  it("讀到之後一分鐘 秒數照實際經過的時間減", () => {
    const later = min(1);

    expect(withLive([], { kind: "estimate", seconds: 180, readAt: NOW }, later)[0].at - later).toBe(120_000);
  });

  it("沒有即時資料_照時刻表", () => {
    expect(withLive([train(1), train(-1)], { kind: "none" }, NOW).map((item) => item.at)).toEqual([min(1)]);
  });
});

describe("shouldReadLive：免費額度有限 只在快開車時才問", () => {
  it.each([
    ["tra", 10, true],
    ["tra", 30, true],
    ["tra", 31, false],
    ["metro", 10, true],
    ["thsr", 10, false],
    ["bus", 45, true],
  ] as const)("%s_開車前 %i 分鐘_%s", (mode, minutes, expected) => {
    expect(shouldReadLive(mode, min(minutes), NOW)).toBe(expected);
  });

  it("捷運沒有時刻表時（文湖線）一律要問", () => {
    expect(shouldReadLive("metro", null, NOW)).toBe(true);
  });

  it("今天沒有班次了_台鐵不用問", () => {
    expect(shouldReadLive("tra", null, NOW)).toBe(false);
  });
});

describe("即時資料的解析", () => {
  it("台鐵看板：車次對誤點分鐘", () => {
    expect(parseTraDelays([{ TrainNo: "123", DelayTime: 5 }, { TrainNo: "456", DelayTime: 0 }, { TrainNo: "789" }])).toEqual({ "123": 5, "456": 0 });
  });

  it("捷運看板：照方向取最快的一班 EstimateTime 單位是分鐘", () => {
    const rows = [
      { DestinationStationID: "R28", EstimateTime: 6, ServiceStatus: 0 },
      { DestinationStationID: "R28", EstimateTime: 2, ServiceStatus: 0 },
      { DestinationStationID: "R02", EstimateTime: 1, ServiceStatus: 0 },
    ];

    expect(parseMetroEstimate(rows, "R28")).toBe(2);
  });

  it("捷運看板：拼錯的舊欄位 DestinationStaionID 也認 尚未發車的不算", () => {
    expect(parseMetroEstimate([{ DestinationStaionID: "R28", EstimateTime: 4, ServiceStatus: 0 }], "R28")).toBe(4);
    expect(parseMetroEstimate([{ DestinationStationID: "R28", EstimateTime: 4, ServiceStatus: 1 }], "R28")).toBeNull();
  });
});
