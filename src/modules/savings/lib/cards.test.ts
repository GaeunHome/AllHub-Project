import { describe, expect, it } from "vitest";
import { billDifference, billPayments, billStatus, cardBill, currentStatement, dueDateAfter, lastStatementDate, nextDueDate, statementDueDate, type CardDailyFlow, type CardStatement } from "./cards";

const flow = (date: string, values: Partial<Omit<CardDailyFlow, "accountId" | "date">>, accountId = 5): CardDailyFlow => ({
  accountId,
  date,
  income: 0,
  expense: 0,
  transferIn: 0,
  transferOut: 0,
  adjust: 0,
  ...values,
});

describe("lastStatementDate（嚴格早於今天、日子是結帳日的最近一天）", () => {
  it.each([
    [5, "2026-10-06", "2026-10-05"],
    [5, "2026-10-05", "2026-09-05"],
    [5, "2026-10-04", "2026-09-05"],
    [31, "2026-10-31", "2026-09-30"],
    [31, "2026-11-01", "2026-10-31"],
    [30, "2026-03-01", "2026-02-28"],
    [25, "2027-01-10", "2026-12-25"],
  ])("結帳日 %i、今天 %s_上次結帳是 %s（沒有那天就月底、今天結帳的要明天才算）", (statementDay, today, expected) => {
    expect(lastStatementDate(statementDay, today)).toBe(expected);
  });
});

describe("dueDateAfter（結帳日之後第一個日子是截止日的日期）", () => {
  it.each([
    ["2026-10-05", 20, "2026-10-20"],
    ["2026-10-25", 10, "2026-11-10"],
    ["2026-10-20", 20, "2026-11-20"],
    ["2026-02-28", 30, "2026-03-30"],
    ["2026-12-15", 5, "2027-01-05"],
  ])("%s 結帳、截止日 %i_是 %s", (statementDate, dueDay, expected) => {
    expect(dueDateAfter(statementDate, dueDay)).toBe(expected);
  });
});

// 銀行的繳款截止日遇假日順延到下一個營業日
// 假日照人事總處的辦公日曆表 2026-10-25 是週日 10/26 補假
describe("截止日遇假日順延到下一個工作日", () => {
  it.each([
    ["2026-10-05", 25, "2026-10-27", "10/25 是週日、10/26 補假"],
    ["2026-12-05", 20, "2026-12-21", "12/20 是週日"],
    ["2026-01-31", 31, "2026-03-02", "2 月沒有 31 日 月底 2/28 是和平紀念日（六）、3/1 是週日"],
  ])("%s 結帳、截止日 %i_是 %s（%s）", (statementDate, dueDay, expected) => {
    expect(dueDateAfter(statementDate, dueDay)).toBe(expected);
  });

  it.each([
    [25, "2026-10-15", "2026-10-27", "這個月的 10/25 順延到 10/27"],
    [25, "2026-10-26", "2026-10-27", "原本的 10/25 過了 但順延後的 10/27 還沒到"],
    [25, "2026-10-27", "2026-10-27", "順延後的那天當天"],
    [25, "2026-10-28", "2026-11-25", "順延後的也過了 換下個月"],
    [31, "2026-11-01", "2026-11-02", "10/31 是週六 順延到 11/2 上個月的截止日跨到這個月"],
    [31, "2026-11-03", "2026-11-30", "上個月的過了才是這個月的"],
    [6, "2026-10-06", "2026-10-06", "今天就是截止日"],
    [10, "2026-12-11", "2027-01-11", "跨年 2027-01-10 是週日"],
    [31, "2027-02-01", "2027-02-01", "1/31 是週日 順延到 2/1 就是今天"],
    [31, "2027-02-02", "2027-03-02", "2027-02-28 是週日、3/1 補假"],
    [31, "2028-02-01", "2028-02-29", "表裡沒有 2028 年 只看週末 2/29 是週二"],
  ])("截止日 %i、今天 %s_最近的截止日是 %s（%s）", (dueDay, today, expected) => {
    expect(nextDueDate(dueDay, today)).toBe(expected);
  });
});

const bill = (id: number, statementDate: string, dueDate: string, amount: number, accountId = 5): CardStatement => ({ id, accountId, statementDate, dueDate, amount });

describe("cardBill（有結帳日：結帳後就要填帳單，填了之後還沒繳清才列）", () => {
  const CARD = { id: 5, statementDay: 5, dueDay: 20 };
  // 起始未繳 5,000 9/28 刷 3,000 10/3 刷 2,000 都在 10/5 結帳前 結帳後 10/7 刷 1,500 10/10 繳 4,000
  // 未繳 5,000 加刷卡 6,500 減繳款 4,000 目前餘額是 -7,500 扣回結帳後的 +2,500 結帳時是 -10,000
  const FLOWS = [flow("2026-09-28", { expense: 3000 }), flow("2026-10-03", { expense: 2000 }), flow("2026-10-07", { expense: 1500 }), flow("2026-10-10", { transferIn: 4000 })];

  it("還沒填帳單_要填帳單（一定列進待處理）：估計是紀錄算的結帳日未繳 10,000、結帳後繳了 4,000、照估計還要繳 6,000", () => {
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-15")).toEqual({
      accountId: 5,
      owedNow: 7500,
      statementDate: "2026-10-05",
      dueDate: "2026-10-20",
      billId: null,
      statementAmount: null,
      estimate: 10_000,
      paid: 4000,
      remainingDue: 6000,
      needsBill: true,
      status: "upcoming",
      daysLeft: 5,
    });
  });

  it("填了 10/5 的帳單 12,480（銀行說的比紀錄多）_本期還要繳 12,480 減已繳 4,000 是 8,480，不用再填", () => {
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-15", [bill(1, "2026-10-05", "2026-10-20", 12_480)])).toMatchObject({
      billId: 1,
      statementAmount: 12_480,
      paid: 4000,
      remainingDue: 8480,
      needsBill: false,
      status: "upcoming",
    });
  });

  it("帳單繳清了（4,000 繳了 4,000）或帳單是 0 元_不列", () => {
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-15", [bill(1, "2026-10-05", "2026-10-20", 4000)])).toMatchObject({ remainingDue: 0, needsBill: false, status: "none" });
    expect(cardBill(CARD, 0, [], "2026-10-15", [bill(1, "2026-10-05", "2026-10-20", 0)])).toMatchObject({ remainingDue: 0, needsBill: false, status: "none" });
  });

  it("上一期（9/5）或別張卡的帳單不算這一期的_還要填；別張卡的流量也不算", () => {
    const others = [...FLOWS, flow("2026-10-08", { transferIn: 9000 }, 6)];

    expect(cardBill(CARD, -7500, others, "2026-10-15", [bill(1, "2026-09-05", "2026-09-21", 9000), bill(2, "2026-10-05", "2026-10-20", 9000, 6)])).toMatchObject({
      needsBill: true,
      paid: 4000,
      remainingDue: 6000,
    });
  });

  it("截止日當天是 today、過了還沒填或還沒繳清都是 overdue（逾期幾天是負的）", () => {
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-20")).toMatchObject({ needsBill: true, status: "today", daysLeft: 0 });
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-22")).toMatchObject({ needsBill: true, status: "overdue", daysLeft: -2 });
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-22", [bill(1, "2026-10-05", "2026-10-20", 12_480)])).toMatchObject({ remainingDue: 8480, status: "overdue", daysLeft: -2 });
  });

  it("截止日用帳單記下的（填帳單之後才改了截止日也照帳單）", () => {
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-15", [bill(1, "2026-10-05", "2026-10-21", 12_480)])).toMatchObject({ dueDate: "2026-10-21", daysLeft: 6 });
  });

  it("結帳後的刷退（收入）與更新餘額的調整不算繳款：估計與已繳都不變", () => {
    const withRefund = [...FLOWS, flow("2026-10-12", { income: 800, adjust: -300 })];

    expect(cardBill(CARD, -7500 + 800 - 300, withRefund, "2026-10-15")).toMatchObject({ estimate: 10_000, paid: 4000, remainingDue: 6000, owedNow: 7000 });
  });

  it("結帳時是溢繳（餘額是正的）_估計 0，還是要填帳單（不是每筆刷卡都有記）", () => {
    expect(cardBill(CARD, 300, [], "2026-10-15")).toMatchObject({ owedNow: 0, estimate: 0, remainingDue: 0, needsBill: true, status: "upcoming" });
  });

  it("有結帳日沒有截止日_算得出估計，但不用填帳單也不列", () => {
    expect(cardBill({ id: 5, statementDay: 5, dueDay: null }, -7500, FLOWS, "2026-10-15")).toMatchObject({ estimate: 10_000, dueDate: null, daysLeft: null, needsBill: false, status: "none" });
  });

  it("截止日遇假日順延：10/25 是週日、10/26 補假，照 10/27 算逾期與幾天", () => {
    const sunday = { id: 5, statementDay: 5, dueDay: 25 };

    expect(cardBill(sunday, -1000, [], "2026-10-26")).toMatchObject({ dueDate: "2026-10-27", status: "upcoming", daysLeft: 1 });
    expect(cardBill(sunday, -1000, [], "2026-10-28")).toMatchObject({ dueDate: "2026-10-27", status: "overdue", daysLeft: -1 });
  });
});

describe("cardBill（沒有結帳日：截止前 10 天內要填帳單，填的那天就是結帳日）", () => {
  // 截止日 25 日 2026-10-25 是週日 10/26 補假 順延到 10/27
  const CARD = { id: 5, statementDay: null, dueDay: 25 };

  it("10/16 還有 11 天_還不用填、不列；本期應繳先用目前未繳", () => {
    expect(cardBill(CARD, -3500, [], "2026-10-16")).toMatchObject({ needsBill: false, status: "none", dueDate: "2026-10-27", daysLeft: 11, estimate: 3500, remainingDue: 3500 });
  });

  it("10/17 起（截止前 10 天）還沒填_要填帳單，估計是目前未繳；未繳是 0 也要填", () => {
    expect(cardBill(CARD, -3500, [], "2026-10-17")).toEqual({
      accountId: 5,
      owedNow: 3500,
      statementDate: null,
      dueDate: "2026-10-27",
      billId: null,
      statementAmount: null,
      estimate: 3500,
      paid: 0,
      remainingDue: 3500,
      needsBill: true,
      status: "upcoming",
      daysLeft: 10,
    });
    expect(cardBill(CARD, 0, [], "2026-10-17")).toMatchObject({ estimate: 0, needsBill: true, status: "upcoming" });
  });

  it("10/18 填了帳單 3,800_填帳單那天起繳的才算已繳（10/17 繳的 500 是上一期的）：10/18 繳 1,000 還要繳 2,800", () => {
    const flows = [flow("2026-10-17", { transferIn: 500 }), flow("2026-10-18", { transferIn: 1000 })];

    expect(cardBill(CARD, -2300, flows, "2026-10-20", [bill(2, "2026-10-18", "2026-10-27", 3800)])).toMatchObject({
      statementDate: "2026-10-18",
      billId: 2,
      statementAmount: 3800,
      paid: 1000,
      remainingDue: 2800,
      needsBill: false,
      status: "upcoming",
    });
  });

  it("繳清了_不列", () => {
    expect(cardBill(CARD, 0, [flow("2026-10-18", { transferIn: 3800 })], "2026-10-20", [bill(2, "2026-10-18", "2026-10-27", 3800)])).toMatchObject({ remainingDue: 0, status: "none" });
  });

  it("截止日過了還沒繳清_逾期；下一期也進了截止前 10 天就改成填下一期的帳單（銀行的新帳單會算進沒繳的）", () => {
    const unpaid = [bill(2, "2026-10-18", "2026-10-27", 3800)];

    expect(cardBill(CARD, -3800, [], "2026-10-28", unpaid)).toMatchObject({ billId: 2, dueDate: "2026-10-27", remainingDue: 3800, status: "overdue", daysLeft: -1 });
    expect(cardBill(CARD, -3800, [], "2026-11-15", unpaid)).toMatchObject({ billId: null, dueDate: "2026-11-25", needsBill: true, status: "upcoming", daysLeft: 10 });
  });

  it("沒有截止日的卡_不用填、不列", () => {
    expect(cardBill({ id: 5, statementDay: null, dueDay: null }, -3500, [], "2026-10-15")).toMatchObject({ owedNow: 3500, dueDate: null, daysLeft: null, needsBill: false, status: "none" });
  });
});

describe("currentStatement 與 statementDueDate（填帳單的那一期）", () => {
  it("有結帳日：上次結帳日與它之後的截止日（遇假日順延）", () => {
    expect(currentStatement({ id: 5, statementDay: 5, dueDay: 20 }, "2026-10-15")).toEqual({ statementDate: "2026-10-05", dueDate: "2026-10-20" });
    expect(currentStatement({ id: 5, statementDay: 5, dueDay: 25 }, "2026-10-15")).toEqual({ statementDate: "2026-10-05", dueDate: "2026-10-27" });
  });

  it("沒有結帳日：填帳單那天就是結帳日，截止日是那天之後最近的一個；沒有截止日的卡沒有", () => {
    expect(currentStatement({ id: 5, statementDay: null, dueDay: 25 }, "2026-10-20")).toEqual({ statementDate: "2026-10-20", dueDate: "2026-10-27" });
    expect(currentStatement({ id: 5, statementDay: 5, dueDay: null }, "2026-10-20")).toBeNull();
  });

  it("指定結帳日：有結帳日的卡要是那一天（沒有那天的月份是月底），不然是 null", () => {
    expect(statementDueDate({ id: 5, statementDay: 5, dueDay: 20 }, "2026-09-05")).toBe("2026-09-21");
    expect(statementDueDate({ id: 5, statementDay: 5, dueDay: 20 }, "2026-10-06")).toBeNull();
    expect(statementDueDate({ id: 5, statementDay: 31, dueDay: 15 }, "2026-09-30")).toBe("2026-10-15");
    expect(statementDueDate({ id: 5, statementDay: null, dueDay: 25 }, "2026-10-18")).toBe("2026-10-27");
  });
});

describe("billDifference（帳單跟紀錄算的結帳日未繳差多少）", () => {
  it("紀錄的未繳 3,000、帳單 12,480_少記了 9,480 的刷卡；再填一次 12,000 是 9,000", () => {
    expect(billDifference(12_480, -3000)).toBe(9480);
    expect(billDifference(12_000, -3000)).toBe(9000);
  });

  it("帳單比紀錄少（紀錄 5,000、帳單 4,000）_負 1,000，記成加 1,000 的調整", () => {
    expect(billDifference(4000, -5000)).toBe(-1000);
  });

  it("紀錄上溢繳 300、帳單 1,000_差 1,300，補了之後未繳剛好是帳單的 1,000", () => {
    expect(billDifference(1000, 300)).toBe(1300);
  });

  it("帳單 0 元：紀錄上的溢繳不算差額；紀錄上欠 200 就調回 0", () => {
    expect(billDifference(0, 300)).toBe(0);
    expect(billDifference(0, -200)).toBe(-200);
  });
});

describe("billStatus（帳單紀錄的狀態）", () => {
  it("繳清是已繳清（過了截止日也是、0 元也是）；沒繳清的截止日之前與當天是未繳、過了是逾期", () => {
    expect(billStatus({ amount: 6340, paid: 6340, dueDate: "2026-10-20" }, "2026-10-25")).toBe("paid");
    expect(billStatus({ amount: 0, paid: 0, dueDate: "2026-10-20" }, "2026-10-25")).toBe("paid");
    expect(billStatus({ amount: 6340, paid: 6000, dueDate: "2026-10-20" }, "2026-10-20")).toBe("unpaid");
    expect(billStatus({ amount: 6340, paid: 6000, dueDate: "2026-10-20" }, "2026-10-21")).toBe("overdue");
  });
});

describe("billPayments（每張帳單繳了多少：結帳日之後到下一張的結帳日為止，最新一張到現在）", () => {
  it("有結帳日：結帳日當天繳的算在前一張（銀行的帳單已經扣掉了）", () => {
    const card = { id: 5, statementDay: 5, dueDay: 20 };
    const statements = [bill(3, "2026-10-05", "2026-10-20", 6000), bill(1, "2026-08-05", "2026-08-20", 12_000), bill(2, "2026-09-05", "2026-09-21", 8000)];
    const payments = [
      { date: "2026-08-20", amount: 12_000 },
      { date: "2026-09-05", amount: 500 },
      { date: "2026-09-18", amount: 8000 },
      { date: "2026-10-10", amount: 3000 },
    ];

    expect(billPayments(card, statements, payments)).toEqual([
      { id: 3, paid: 3000, lastPaidOn: "2026-10-10" },
      { id: 1, paid: 12_500, lastPaidOn: "2026-09-05" },
      { id: 2, paid: 8000, lastPaidOn: "2026-09-18" },
    ]);
  });

  it("沒有結帳日：填帳單那天繳的就算這一張；還沒繳的 lastPaidOn 是 null", () => {
    const card = { id: 5, statementDay: null, dueDay: 25 };
    const statements = [bill(1, "2026-09-20", "2026-09-25", 3000), bill(2, "2026-10-20", "2026-10-27", 3800), bill(3, "2026-11-18", "2026-11-25", 1000)];
    const payments = [
      { date: "2026-09-20", amount: 1000 },
      { date: "2026-10-19", amount: 2000 },
      { date: "2026-10-20", amount: 3800 },
    ];

    expect(billPayments(card, statements, payments)).toEqual([
      { id: 1, paid: 3000, lastPaidOn: "2026-10-19" },
      { id: 2, paid: 3800, lastPaidOn: "2026-10-20" },
      { id: 3, paid: 0, lastPaidOn: null },
    ]);
  });
});
