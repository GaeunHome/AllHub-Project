import { describe, expect, it } from "vitest";
import { niceScale, scalePercent } from "./chart-geometry";

describe("座標軸的刻度", () => {
  it("一定包含 0，間距取 1、2、2.5、5 乘上 10 的次方", () => {
    expect(niceScale(0, 43000)).toEqual({ min: 0, max: 60000, ticks: [0, 20000, 40000, 60000] });
    expect(niceScale(0, 100)).toEqual({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(niceScale(12000, 52000).min).toBe(0);
  });

  it("有負數時往下延伸，0 仍在刻度上", () => {
    const scale = niceScale(-1500, 4200);

    expect(scale).toEqual({ min: -2000, max: 6000, ticks: [-2000, 0, 2000, 4000, 6000] });
  });

  it("全部是 0_只有 0 一個刻度，最大值給 1 免得除以 0", () => {
    expect(niceScale(0, 0)).toEqual({ min: 0, max: 1, ticks: [0] });
  });

  it("金額是整數元：刻度間距至少 1 元，不會出現小數", () => {
    const { ticks } = niceScale(0, 3);

    expect(ticks.every(Number.isInteger)).toBe(true);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(3);
    // 間距算出來是 2.5 時改用 5 才不會出現 $2.5 這種刻度
    expect(niceScale(0, 10).ticks).toEqual([0, 5, 10]);
  });

  it("刻度是乾淨的倍數，不會累積浮點誤差", () => {
    const { ticks } = niceScale(0, 0.0, 4);
    expect(ticks).toEqual([0]);
    expect(niceScale(0, 700000).ticks).toEqual([0, 200000, 400000, 600000, 800000]);
  });

  it("換算成高度的百分比（從底部算起）", () => {
    const scale = niceScale(-1500, 4200);

    expect(scalePercent(0, scale)).toBe(25);
    expect(scalePercent(6000, scale)).toBe(100);
    expect(scalePercent(-2000, scale)).toBe(0);
  });
});
