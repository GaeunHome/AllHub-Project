import { describe, expect, it } from "vitest";
import { accountRow, dayFlowRow, flowRow } from "../../dev/fixtures";
import { assetTrend } from "../trend";

// 使用者選的近 30 天每天記一筆 存款照紀錄從今天往回扣 投資有記下市值的日子用市值 沒有的用買進成本

// 存款 8/1 建立 證券帳戶台北時間 9/10 建立 今天是 9/20
const SAVINGS = accountRow({ id: 1, name: "薪轉", kind: "deposit", openingBalance: 10_000, createdAt: new Date("2026-08-01T02:00:00Z") });
const BROKER = accountRow({ id: 2, name: "證券", kind: "investment", openingBalance: 0, openingCost: 0, createdAt: new Date("2026-09-10T02:00:00Z") });
const CARD = accountRow({ id: 3, name: "信用卡", kind: "credit", openingBalance: -5_000, createdAt: new Date("2026-08-01T02:00:00Z") });
const CLOSED = accountRow({ id: 4, name: "舊帳戶", kind: "deposit", openingBalance: 50_000, active: false, createdAt: new Date("2026-08-01T02:00:00Z") });

// 8/5 的薪水在 30 天之前 只在每月的流量裡
const FLOWS = [
  flowRow(1, "2026-08", { income: 5_000 }),
  flowRow(1, "2026-09", { expense: 1_000, transferOut: 4_000 }),
  flowRow(2, "2026-09", { transferIn: 4_000 }),
  flowRow(3, "2026-09", { expense: 3_000 }),
  flowRow(4, "2026-09", { income: 9_000 }),
];
const DAYS = [
  dayFlowRow(1, "2026-09-12", { expense: 1_000 }),
  dayFlowRow(1, "2026-09-15", { transferOut: 4_000 }),
  dayFlowRow(2, "2026-09-15", { transferIn: 4_000 }),
  dayFlowRow(3, "2026-09-13", { expense: 3_000 }),
  dayFlowRow(4, "2026-09-14", { income: 9_000 }),
];

const input = (snapshots: { day: string; investment: number }[] = []) => ({
  accounts: [SAVINGS, BROKER, CARD, CLOSED],
  flows: FLOWS,
  days: DAYS,
  snapshots,
  today: "2026-09-20",
  live: { deposit: 10_000, investment: 4_300 },
});

const rows = (points: ReturnType<typeof assetTrend>) => new Map(points.map(({ day, deposit, investment, total }) => [day, [deposit, investment, total]]));

describe("assetTrend：近 30 天每天的存款與投資", () => {
  it("最多 30 天，從 8/22 到今天 9/20；存款是現在的餘額扣回那天之後的紀錄，證券帳戶建立前不算；信用卡與停用的帳戶不算", () => {
    const points = assetTrend(input());
    const byDay = rows(points);

    expect(points).toHaveLength(30);
    expect([points[0].day, points.at(-1)?.day]).toEqual(["2026-08-22", "2026-09-20"]);
    expect(byDay.get("2026-08-22")).toEqual([15_000, 0, 15_000]);
    expect(byDay.get("2026-09-11")).toEqual([15_000, 0, 15_000]);
    expect(byDay.get("2026-09-12")).toEqual([14_000, 0, 14_000]);
    expect(byDay.get("2026-09-14")).toEqual([14_000, 0, 14_000]);
    expect(byDay.get("2026-09-15")).toEqual([10_000, 4_000, 14_000]);
    expect(byDay.get("2026-09-19")).toEqual([10_000, 4_000, 14_000]);
    expect(byDay.get("2026-09-20")).toEqual([10_000, 4_300, 14_300]);
  });

  it("排程記下市值的日子投資用市值；沒有記到的日子用帳上的成本並標出來；今天用現在的數字；證券帳戶建立前不用標成本", () => {
    const points = assetTrend(input([{ day: "2026-09-18", investment: 4_100 }]));
    const of = (day: string) => points.find((point) => point.day === day);

    expect(of("2026-09-18")).toMatchObject({ investment: 4_100, total: 14_100, atCost: false });
    expect(of("2026-09-17")).toMatchObject({ investment: 4_000, atCost: true });
    expect(of("2026-09-10")).toMatchObject({ investment: 0, atCost: true });
    expect(of("2026-09-09")?.atCost).toBe(false);
    expect(of("2026-09-20")?.atCost).toBe(false);
  });

  it("剛開始用時從最早的帳戶那天畫起，不畫一排空的日子", () => {
    const fresh = accountRow({ id: 5, name: "新帳戶", kind: "deposit", openingBalance: 1_000, createdAt: new Date("2026-09-16T02:00:00Z") });
    const days = assetTrend({ ...input(), accounts: [fresh], flows: [], days: [], live: { deposit: 1_000, investment: 0 } }).map((point) => point.day);

    expect(days).toEqual(["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]);
  });

  it("沒有啟用中的存款或投資帳戶時是空的", () => {
    expect(assetTrend({ ...input(), accounts: [CARD, CLOSED] })).toEqual([]);
  });
});
