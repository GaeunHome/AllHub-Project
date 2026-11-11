import { describe, expect, it } from "vitest";
import { elapsedPercent, ratioPercent, shareOfMax } from "../chart-scale";

describe("shareOfMax：長條照最大的那一項算長度（開拓月曆的三個月與星瓊來源）", () => {
  it("最大的是 100，其他照比例，小數一位：3,600、7,200、5,400 是 50、100、75；1,940、1,800、1,200 是 100、92.8、61.9", () => {
    expect(shareOfMax([3600, 7200, 5400])).toEqual([50, 100, 75]);
    expect(shareOfMax([1940, 1800, 1200])).toEqual([100, 92.8, 61.9]);
  });

  it("沒有數字（null）或全部是 0_畫成 0，不會除以 0", () => {
    expect(shareOfMax([null, 300])).toEqual([0, 100]);
    expect(shareOfMax([0, 0])).toEqual([0, 0]);
  });
});

describe("elapsedPercent：卡池與活動過了多久（時間進度條）", () => {
  const start = Date.parse("2026-11-01T00:00:00Z");
  const end = Date.parse("2026-11-21T00:00:00Z");

  it("20 天的卡池過了 5 天是 25%", () => {
    expect(elapsedPercent(start, end, Date.parse("2026-11-06T00:00:00Z"))).toBe(25);
  });

  it("還沒開始是 0、已經結束是 100；沒有開始或結束時間是 null（不畫）", () => {
    expect(elapsedPercent(start, end, Date.parse("2026-10-30T00:00:00Z"))).toBe(0);
    expect(elapsedPercent(start, end, Date.parse("2026-11-30T00:00:00Z"))).toBe(100);
    expect(elapsedPercent(null, end, start)).toBeNull();
  });
});

describe("ratioPercent：進度條的長度（拿了幾顆星、活動做了幾次）", () => {
  it("24/36 是 66.7、2/10 是 20、超過上限算 100", () => {
    expect(ratioPercent(24, 36)).toBe(66.7);
    expect(ratioPercent(2, 10)).toBe(20);
    expect(ratioPercent(12, 10)).toBe(100);
  });

  it("沒有上限（0 或 null）_null，不畫進度條", () => {
    expect(ratioPercent(0, 0)).toBeNull();
    expect(ratioPercent(3, null)).toBeNull();
  });
});
