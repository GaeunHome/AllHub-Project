import { describe, expect, it } from "vitest";
import { accountRow, flowRow } from "../../dev/fixtures";
import { assetTrend } from "../trend";

// 使用者選的回推加每月記一筆 存款照紀錄 投資有記下市值的月份用市值 沒有的用買進成本

// 台北時間 6/15 建立的存款 8/3 建立的證券帳戶
const SAVINGS = accountRow({ id: 1, name: "薪轉", kind: "deposit", openingBalance: 10_000, createdAt: new Date("2026-06-15T02:00:00Z") });
const BROKER = accountRow({ id: 2, name: "證券", kind: "investment", openingBalance: 0, openingCost: 0, createdAt: new Date("2026-08-03T02:00:00Z") });
const CARD = accountRow({ id: 3, name: "信用卡", kind: "credit", openingBalance: -5_000, createdAt: new Date("2026-06-01T02:00:00Z") });
const CLOSED = accountRow({ id: 4, name: "舊帳戶", kind: "deposit", openingBalance: 50_000, active: false, createdAt: new Date("2026-06-01T02:00:00Z") });

const FLOWS = [
  flowRow(1, "2026-06", { income: 5_000, expense: 2_000 }),
  flowRow(1, "2026-07", { expense: 1_000 }),
  flowRow(1, "2026-08", { transferOut: 4_000 }),
  flowRow(2, "2026-08", { transferIn: 4_000 }),
  flowRow(3, "2026-07", { expense: 3_000 }),
  flowRow(4, "2026-07", { income: 9_000 }),
];

const input = (snapshots: { month: string; investment: number }[] = []) => ({
  accounts: [SAVINGS, BROKER, CARD, CLOSED],
  flows: FLOWS,
  snapshots,
  current: "2026-09",
  live: { deposit: 39_000, investment: 5_200 },
});

describe("assetTrend：每個月底的存款與投資", () => {
  it("從最早的帳戶那個月畫到這個月；存款是起始餘額加到那個月為止的紀錄，證券帳戶建立前不算；信用卡與停用的帳戶不算", () => {
    expect(assetTrend(input()).map(({ month, deposit, investment, total }) => [month, deposit, investment, total])).toEqual([
      ["2026-06", 13_000, 0, 13_000],
      ["2026-07", 12_000, 0, 12_000],
      ["2026-08", 8_000, 4_000, 12_000],
      ["2026-09", 39_000, 5_200, 44_200],
    ]);
  });

  it("排程記下市值的月份投資用市值；沒有記到的月份用帳上的成本並標出來，這個月用現在的數字", () => {
    const withSnapshot = assetTrend(input([{ month: "2026-08", investment: 4_300 }]));
    const atCost = assetTrend(input());

    expect(withSnapshot.find((point) => point.month === "2026-08")).toMatchObject({ investment: 4_300, total: 12_300, atCost: false });
    expect(atCost.find((point) => point.month === "2026-08")).toMatchObject({ investment: 4_000, atCost: true });
    expect(atCost.at(-1)?.atCost).toBe(false);
  });

  it("還沒有證券帳戶的月份不用標成本", () => {
    expect(assetTrend(input()).slice(0, 2).map((point) => point.atCost)).toEqual([false, false]);
  });

  it("最多 12 個月：2025 年 6 月建立的帳戶，到 2026 年 9 月只畫最近 12 個月", () => {
    const old = accountRow({ id: 5, name: "老帳戶", kind: "deposit", openingBalance: 1_000, createdAt: new Date("2025-06-10T02:00:00Z") });
    const months = assetTrend({ ...input(), accounts: [old] }).map((point) => point.month);

    expect(months).toHaveLength(12);
    expect([months[0], months.at(-1)]).toEqual(["2025-10", "2026-09"]);
  });

  it("沒有啟用中的存款或投資帳戶時是空的", () => {
    expect(assetTrend({ ...input(), accounts: [CARD, CLOSED] })).toEqual([]);
  });
});
