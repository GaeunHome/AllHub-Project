import { describe, expect, it } from "vitest";
import { accountRow, ruleRow } from "../dev/fixtures";
import type { AccountBalance } from "../lib/ledger";
import type { PendingRuleRow } from "../lib/pending";
import { recurringDetail } from "./format";
import { recurringPageView, whenText, type RecurringSources } from "./recurring-view";

// 今天是 2026-10-16 星期五 人事總處 2026 年辦公日曆表 10/9 週五放假 10/10 週六
const TODAY = "2026-10-16";
const CREATED = new Date("2026-08-01T02:00:00Z");

const account = (id: number, name: string, kind: "deposit" | "investment" | "credit", fields: Partial<ReturnType<typeof accountRow>> = {}) => accountRow({ id, name, kind, createdAt: CREATED, ...fields });
const ACCOUNTS = [
  account(1, "生活費帳戶", "deposit"),
  account(2, "台銀", "deposit", { monthlyPlan: 5000 }),
  account(3, "緊急預備金 A", "deposit", { monthlyPlan: 2000, targetAmount: 10000 }),
  account(4, "緊急預備金 B", "deposit", { monthlyPlan: 2000, targetAmount: 10000 }),
  account(5, "國泰卡", "credit", { payFromAccountId: 1 }),
  account(6, "臺銀證券", "investment", { monthlyPlan: 3000 }),
  account(7, "舊帳戶", "deposit", { monthlyPlan: 1000, active: false }),
];
const balance = (amount: number): AccountBalance => ({ balance: amount, cost: null, profit: null, owed: null });
const BALANCES = new Map([
  [1, balance(20000)],
  [2, balance(3000)],
  [3, balance(8500)],
  [4, balance(10000)],
  [5, balance(-3000)],
  [6, balance(0)],
  [7, balance(500)],
]);
const CATEGORIES = [
  { id: 11, name: "房租", kind: "expense" as const, monthlyBudget: null, icon: "house" },
  { id: 12, name: "電費", kind: "expense" as const, monthlyBudget: null, icon: null },
  { id: 21, name: "薪水", kind: "income" as const, monthlyBudget: null, icon: "briefcase" },
];
const HOLDINGS = [{ id: 50, accountId: 6, symbol: "006208", name: "富邦台灣50", shares: 238, cost: 24000, sortOrder: 0 }];
const QUOTES = [{ symbol: "006208", name: "富邦台灣50", closeCents: 10000, date: "2026-10-15", market: "twse" as const }];

const rule = (id: number, fields: Partial<PendingRuleRow>): PendingRuleRow & { userId: string } => ruleRow({ id, categoryId: 11, createdAt: CREATED, ...fields });
// 10/10 是週六 10/9 放假 提前到 10/8
const SALARY = rule(30, { kind: "income", name: "薪水", categoryId: 21, amount: 52000, dayOfMonth: 10, holidayRule: "before", allocate: true });
const REGULAR = rule(31, { kind: "transfer", accountId: 2, counterAccountId: 6, categoryId: null, holdingId: 50, amount: 5000, dayOfMonth: 5, holidayRule: "after" });
const RENT = rule(32, { name: "房租" });
const POWER = rule(33, { name: "電費", categoryId: 12, amount: 1200, intervalMonths: 2, startMonth: "2026-09-01" });
const NETFLIX = rule(34, { name: "Netflix", mode: "auto", amount: 390, dayOfMonth: 12, lastPostedMonth: "2026-10-01" });
const GYM = rule(35, { name: "健身房", active: false });
const TO_OLD = rule(36, { kind: "transfer", counterAccountId: 7, categoryId: null, amount: 1000, dayOfMonth: 1 });
// 9/1 與 10/1 都還沒處理
const PHONE = rule(37, { name: "手機", amount: 599, dayOfMonth: 1, lastPostedMonth: "2026-08-01" });

const SOURCES: RecurringSources = {
  accounts: ACCOUNTS,
  rules: [SALARY, REGULAR, RENT, POWER, NETFLIX, GYM, TO_OLD, PHONE],
  categories: CATEGORIES,
  holdings: HOLDINGS,
  quotes: QUOTES,
  balances: BALANCES,
  today: TODAY,
};
const view = () => recurringPageView(SOURCES);

describe("whenText：排程寫成一句話", () => {
  it("每月幾日，遇假日寫在括號裡；每年的寫出月份", () => {
    expect(whenText(SALARY)).toBe("每月 10 日（遇假日提前）");
    expect(whenText(REGULAR)).toBe("每月 5 日（遇假日延後）");
    expect(whenText(rule(1, { intervalMonths: 12, startMonth: "2027-03-01", dayOfMonth: 15 }))).toBe("每年 3 月 15 日");
  });
});

describe("每月固定頁的三區", () => {
  it("薪水、定期定額各一區，其他的照下一期的日期排，停用的排在最後", () => {
    const { salaries, regularBuys, others } = view();

    expect(salaries.map((row) => row.id)).toEqual([30]);
    expect(regularBuys.map((row) => row.id)).toEqual([31]);
    // 手機 9/1 還沒處理 房租 10/20 Netflix 11/12 電費每 2 個月 下一期 11/20
    expect(others.map((row) => [row.id, row.nextDate])).toEqual([
      [37, "2026-09-01"],
      [32, "2026-10-20"],
      [34, "2026-11-12"],
      [33, "2026-11-20"],
      [35, null],
      [36, null],
    ]);
  });

  it("停用的規則與用到停用帳戶的規則都標出來，不會到期", () => {
    const others = view().others;

    expect(others.find((row) => row.id === 35)).toMatchObject({ paused: "rule", due: null });
    expect(others.find((row) => row.id === 36)).toMatchObject({ paused: "account", due: null });
  });
});

describe("到期（跟總覽的這個月要做的事同一期：到了或 7 天內會到）", () => {
  it("要確認的固定收支：7 天內會到的那一期可以確認，日期先填今天（不能記未來）", () => {
    const rent = view().others.find((row) => row.id === 32);

    expect(rent?.due).toMatchObject({ period: "2026-10", date: "2026-10-20", status: "upcoming", daysLeft: 4, laterCount: 0, salary: null });
    expect(rent?.due?.confirm).toMatchObject({ ruleId: 32, period: "2026-10", amount: 15000, date: TODAY });
  });

  it("兩期都沒處理：先處理最舊的那一期，寫出之後還有幾期", () => {
    expect(view().others.find((row) => row.id === 37)?.due).toMatchObject({ period: "2026-09", date: "2026-09-01", status: "overdue", daysLeft: -45, laterCount: 1 });
  });

  it("自動記帳的、還不到 7 天內的不用處理", () => {
    const others = view().others;

    expect(others.find((row) => row.id === 34)?.due).toBeNull();
    expect(others.find((row) => row.id === 33)?.due).toBeNull();
  });

  it("薪水到期是入帳並分配：帶那一期的金額、入帳帳戶、分類與（假日提前後的）日期", () => {
    const [salary] = view().salaries;

    expect(salary.due).toMatchObject({ status: "overdue", daysLeft: -8, confirm: null });
    expect(salary.due?.salary).toEqual({ ruleId: 30, period: "2026-10", amount: 52000, accountId: 1, categoryId: 21, date: "2026-10-08" });
  });

  it("定期定額到期：照收盤價估好股數與扣款（手續費 1 元含在 5,000 裡，股數無條件捨去）", () => {
    const [regular] = view().regularBuys;

    // 5000 扣掉手續費 1 元 每股 100 元買得到 49 股 價金 4900 加手續費是 4901
    expect(regular.due?.confirm?.regularBuy).toMatchObject({ symbol: "006208", estimate: { shares: 49, cost: 4901 } });
    expect(regular).toMatchObject({ symbol: "006208", holdingName: "富邦台灣50", fromName: "台銀" });
  });
});

describe("薪水入帳後怎麼分配", () => {
  it("照每月規劃，有目標的分到目標為止；入帳帳戶、信用卡、有持股的投資帳戶、停用的不分；剩下的留在入帳帳戶", () => {
    const [salary] = view().salaries;

    // 緊急預備金 A 有 8500 離目標差 1500 B 已經到目標 留下 52000 減 5000 減 1500 是 45500
    expect(salary.allocation.map((line) => [line.name, line.suggested, line.reason])).toEqual([
      ["台銀", 5000, "plan"],
      ["緊急預備金 A", 1500, "target-capped"],
      ["緊急預備金 B", 0, "target-reached"],
    ]);
    expect(salary.remainder).toBe(45500);
    expect(salary.receivingName).toBe("生活費帳戶");
  });

  it("修改分配能改的帳戶：啟用中的存款與沒有持股的投資帳戶，不含信用卡與停用的", () => {
    expect(view().allocationAccounts.map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("交給瀏覽器的內容", () => {
  it("修改視窗帶入的原本內容不含 userId", () => {
    for (const row of [...view().others, ...view().salaries, ...view().regularBuys]) expect(row.draft).not.toHaveProperty("userId");
  });

  it("每一列的圖示用分類選的圖示", () => {
    expect(view().others.find((row) => row.id === 32)?.icon).toBe("house");
  });
});

describe("recurringDetail：名稱下面那一行", () => {
  const detailOf = (id: number) => {
    const row = view().others.find((item) => item.id === id);
    return row ? recurringDetail(row, row.schedule) : "";
  };

  it("要處理的那一期寫日期與還有幾天；逾期的改用標籤，這一行只寫日期；之後還有的寫還有幾期", () => {
    expect(detailOf(32)).toBe("每月 20 日 · 到期請我確認 · 10/20 到期 · 還有 4 天");
    expect(detailOf(37)).toBe("每月 1 日 · 到期請我確認 · 9/1 · 還有 1 期");
  });

  it("還不用處理的寫下一期；停用的不寫", () => {
    expect(detailOf(33)).toBe("每 2 個月 20 日 · 到期請我確認 · 下一期 11/20");
    expect(detailOf(35)).toBe("每月 20 日 · 到期請我確認");
  });
});
