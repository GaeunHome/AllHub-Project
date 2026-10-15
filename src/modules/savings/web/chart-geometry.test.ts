import { describe, expect, it } from "vitest";
import { DONUT_CIRCUMFERENCE, DONUT_RADIUS, areaPath, columnCenters, donutSegments, linePath, liftOffset, niceScale, scalePercent } from "./chart-geometry";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("甜甜圈的幾何", () => {
  it("圓周正規化成 100：每一片的長度與起點就是百分比", () => {
    expect(2 * Math.PI * DONUT_RADIUS).toBeCloseTo(DONUT_CIRCUMFERENCE, 6);
  });

  it("依金額分配圓周，起點依序接在上一片後面；兩片以上時每片讓出一點空隙", () => {
    const segments = donutSegments([300, 100], { gap: 1 });

    expect(segments[0]).toMatchObject({ start: 0.5, length: 74 });
    expect(segments[1]).toMatchObject({ start: 75.5, length: 24 });
    expect(segments[0].mid).toBeCloseTo(37.5);
    expect(segments[1].mid).toBeCloseTo(87.5);
  });

  it("只有一片_畫成完整的圓，不留空隙", () => {
    expect(donutSegments([5000], { gap: 1 })).toEqual([{ start: 0, length: 100, mid: 50 }]);
  });

  it("很小的一片至少留一小段看得到，不會被空隙吃掉", () => {
    const [, tiny] = donutSegments([100000, 10], { gap: 1, minLength: 0.4 });

    expect(tiny.length).toBe(0.4);
  });

  it("金額是 0 或負數的片長度是 0；全部都是 0 時每片都是 0，不會除以 0", () => {
    const segments = donutSegments([0, 200, -50, 200], { gap: 1 });

    expect(segments[0].length).toBe(0);
    expect(segments[2].length).toBe(0);
    expect(sum(segments.map((s) => s.length))).toBeCloseTo(98);
    expect(donutSegments([0, 0]).every((s) => s.length === 0 && Number.isFinite(s.start))).toBe(true);
  });

  it("滑過時往外移：方向是這一片中間的角度（從右邊開始順時針，外層再轉到從 12 點鐘開始）", () => {
    const at = (mid: number) => {
      const { x, y } = liftOffset(mid, 2);
      return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
    };

    expect(at(0)).toEqual([2, 0]);
    expect(at(25)).toEqual([0, 2]);
    expect(at(50)).toEqual([-2, 0]);
    expect(at(75)).toEqual([0, -2]);
  });
});

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

describe("折線與欄位的位置", () => {
  it("每個月一欄，點放在欄的正中間（百分比）", () => {
    expect(columnCenters(4)).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(columnCenters(0)).toEqual([]);
  });

  it("折線：在 0–100 的座標裡由左到右連起來，y 從上往下算（100 是底部）", () => {
    expect(
      linePath([
        { x: 12.5, y: 25 },
        { x: 37.5, y: 50 },
        { x: 62.5, y: 100 },
      ]),
    ).toBe("M12.5 75L37.5 50L62.5 0");
  });

  it("面積：沿著折線再回到基準線（0 的高度）收起來", () => {
    expect(
      areaPath(
        [
          { x: 25, y: 40 },
          { x: 75, y: 80 },
        ],
        10,
      ),
    ).toBe("M25 90L25 60L75 20L75 90Z");
  });

  it("沒有點或只有一個點_畫不出線，回傳空字串", () => {
    expect(linePath([])).toBe("");
    expect(linePath([{ x: 50, y: 50 }])).toBe("");
    expect(areaPath([{ x: 50, y: 50 }], 0)).toBe("");
  });

  it("座標四捨五入到小數兩位，標記不會拖著一長串小數", () => {
    expect(linePath([
      { x: 100 / 3, y: 100 / 3 },
      { x: 200 / 3, y: 200 / 3 },
    ])).toBe("M33.33 66.67L66.67 33.33");
  });
});
