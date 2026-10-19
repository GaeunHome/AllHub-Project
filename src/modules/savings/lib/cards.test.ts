import { describe, expect, it } from "vitest";
import { dayFlowRow } from "../dev/fixtures";
import { billDefaults, billDifference, billPayments, billStatus, cardBill, defaultDueDate, lastStatementDate, payableDueDate, type CardDailyFlow, type CardStatement } from "./cards";

// 卡片 id 預設是下面的 CARD
const flow = (date: string, values: Partial<CardDailyFlow>, accountId = 5) => dayFlowRow(accountId, date, values);

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

const bill = (id: number, statementDate: string, dueDate: string, amount: number, accountId = 5): CardStatement => ({ id, accountId, statementDate, dueDate, amount });

// 截止日照帳單填的存 遇假日跟銀行一樣順延到下一個營業日
// 假日照人事總處的辦公日曆表 2026-10-25 是週日 10/26 補假
describe("payableDueDate（照帳單填的截止日遇假日順延到下一個工作日）", () => {
  it.each([
    ["2026-10-25", "2026-10-27", "10/25 是週日、10/26 補假"],
    ["2026-12-20", "2026-12-21", "12/20 是週日"],
    ["2026-02-28", "2026-03-02", "2/28 是和平紀念日（六）、3/1 是週日"],
    ["2026-10-20", "2026-10-20", "平日照原日"],
    ["2026-10-27", "2026-10-27", "v0.1.6 存的已經順延過，不會再往後"],
  ])("%s_是 %s（%s）", (dueDate, expected) => {
    expect(payableDueDate(dueDate)).toBe(expected);
  });
});

describe("defaultDueDate（填帳單時截止日的預設是帳單上印的日子、不順延：照上一張帳單截止日的日子，沒有就用舊的截止日設定，都沒有是結帳後 15 天）", () => {
  it.each([
    ["2026-11-05", bill(1, "2026-10-05", "2026-10-20", 1000), "2026-11-20", "結帳日之後第一個 20 日"],
    ["2026-10-25", bill(1, "2026-09-25", "2026-10-10", 1000), "2026-11-10", "這個月的 10 日在結帳日之前 換下個月"],
    ["2026-10-20", bill(1, "2026-09-20", "2026-10-20", 1000), "2026-11-20", "跟結帳日同一天不算 要之後"],
    ["2026-04-05", bill(1, "2026-03-05", "2026-03-31", 1000), "2026-04-30", "4 月沒有 31 日 算月底"],
    ["2026-12-15", bill(1, "2026-11-15", "2026-12-05", 1000), "2027-01-05", "跨年"],
    ["2026-10-05", bill(1, "2026-09-05", "2026-09-25", 1000), "2026-10-25", "10/25 是週日 還是寫印的日子 順延交給 payableDueDate"],
    ["2026-09-30", bill(1, "2026-07-31", "2026-08-31", 1000), "2026-10-31", "9/30 之後的第一個 31 日是 10/31（六） 不順延"],
  ])("%s 結帳、上一張帳單的截止日是 %j_預設 %s（%s）", (statementDate, previous, expected) => {
    expect(defaultDueDate(statementDate, [previous], null)).toBe(expected);
  });

  it("上一張是這一期之前最新的那張：8/22 與 9/21 截止的兩張，10/5 結帳照 21 日 → 10/21", () => {
    expect(defaultDueDate("2026-10-05", [bill(2, "2026-09-05", "2026-09-21", 1000), bill(1, "2026-08-05", "2026-08-22", 1000)], null)).toBe("2026-10-21");
  });

  it("有上一張帳單就照帳單，不看舊的截止日設定（18 日、設定是 25 日 → 11/18）", () => {
    expect(defaultDueDate("2026-11-05", [bill(1, "2026-10-05", "2026-10-18", 1000)], 25)).toBe("2026-11-18");
  });

  it.each([
    [20, "2026-10-20", "結帳日之後的 20 日"],
    [3, "2026-11-03", "3 日在結帳日之前 換下個月"],
    [25, "2026-10-25", "10/25 是週日 不順延"],
  ])("還沒有帳單_用舊的截止日設定 %i 日：10/5 結帳 → %s（%s）", (dueDay, expected) => {
    expect(defaultDueDate("2026-10-05", [], dueDay)).toBe(expected);
  });

  it.each([
    ["2026-10-05", "2026-10-20", "10/20 是週二"],
    ["2026-10-10", "2026-10-25", "10/25 是週日 不順延"],
    ["2026-12-20", "2027-01-04", "跨年"],
  ])("沒有帳單也沒有舊的設定_結帳後 15 天：%s → %s（%s）", (statementDate, expected) => {
    expect(defaultDueDate(statementDate, [], null)).toBe(expected);
  });

  it("同一期再填一次_預設上次填的截止日（照存的）", () => {
    expect(defaultDueDate("2026-10-05", [bill(1, "2026-09-05", "2026-09-21", 1000), bill(2, "2026-10-05", "2026-10-25", 1200)], 20)).toBe("2026-10-25");
  });
});

describe("cardBill（有結帳日：結帳後就要填帳單，填了之後還沒繳清才列）", () => {
  const CARD = { id: 5, statementDay: 5 };
  // 起始未繳 5,000 9/28 刷 3,000 10/3 刷 2,000 都在 10/5 結帳前 結帳後 10/7 刷 1,500 10/10 繳 4,000
  // 未繳 5,000 加刷卡 6,500 減繳款 4,000 目前餘額是 -7,500 扣回結帳後的 +2,500 結帳時是 -10,000
  const FLOWS = [flow("2026-09-28", { expense: 3000 }), flow("2026-10-03", { expense: 2000 }), flow("2026-10-07", { expense: 1500 }), flow("2026-10-10", { transferIn: 4000 })];

  it("還沒填帳單_要填帳單（一定列進待處理），還沒有截止日；估計是紀錄算的結帳日未繳 10,000、結帳後繳了 4,000、照估計還要繳 6,000", () => {
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-15")).toEqual({
      accountId: 5,
      owedNow: 7500,
      statementDate: "2026-10-05",
      dueDate: null,
      statementAmount: null,
      estimate: 10_000,
      paid: 4000,
      remainingDue: 6000,
      needsBill: true,
      status: "needs-bill",
      daysLeft: null,
    });
  });

  it("填了 10/5 的帳單 12,480（銀行說的比紀錄多）_本期還要繳 12,480 減已繳 4,000 是 8,480，不用再填", () => {
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-15", [bill(1, "2026-10-05", "2026-10-20", 12_480)])).toMatchObject({
      statementAmount: 12_480,
      dueDate: "2026-10-20",
      paid: 4000,
      remainingDue: 8480,
      needsBill: false,
      status: "upcoming",
      daysLeft: 5,
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

  it("截止日當天是 today、過了還沒繳清是 overdue（逾期幾天是負的）；還沒填帳單時沒有截止日，過了多久都不算逾期", () => {
    const filled = [bill(1, "2026-10-05", "2026-10-20", 12_480)];

    expect(cardBill(CARD, -7500, FLOWS, "2026-10-20", filled)).toMatchObject({ status: "today", daysLeft: 0 });
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-22", filled)).toMatchObject({ remainingDue: 8480, status: "overdue", daysLeft: -2 });
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-22")).toMatchObject({ needsBill: true, status: "needs-bill", dueDate: null, daysLeft: null });
  });

  it("截止日照帳單填的 10/25（週日、10/26 補假）_順延到 10/27 算幾天與逾期", () => {
    const filled = [bill(1, "2026-10-05", "2026-10-25", 12_480)];

    expect(cardBill(CARD, -7500, FLOWS, "2026-10-26", filled)).toMatchObject({ dueDate: "2026-10-27", status: "upcoming", daysLeft: 1 });
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-27", filled)).toMatchObject({ dueDate: "2026-10-27", status: "today", daysLeft: 0 });
    expect(cardBill(CARD, -7500, FLOWS, "2026-10-28", filled)).toMatchObject({ dueDate: "2026-10-27", status: "overdue", daysLeft: -1 });
  });

  it("結帳後的刷退（收入）與更新餘額的調整不算繳款：估計與已繳都不變", () => {
    const withRefund = [...FLOWS, flow("2026-10-12", { income: 800, adjust: -300 })];

    expect(cardBill(CARD, -7500 + 800 - 300, withRefund, "2026-10-15")).toMatchObject({ estimate: 10_000, paid: 4000, remainingDue: 6000, owedNow: 7000 });
  });

  it("結帳時是溢繳（餘額是正的）_估計 0，還是要填帳單（不是每筆刷卡都有記）", () => {
    expect(cardBill(CARD, 300, [], "2026-10-15")).toMatchObject({ owedNow: 0, estimate: 0, remainingDue: 0, needsBill: true, status: "needs-bill" });
  });
});

describe("cardBill（沒有結帳日：不會自動要你填，自己在帳戶詳情填了之後還沒繳清才列）", () => {
  const CARD = { id: 5, statementDay: null };

  it("還沒填過帳單_不用填也不列，沒有截止日；本期應繳先用目前未繳", () => {
    expect(cardBill(CARD, -3500, [], "2026-10-17")).toMatchObject({ needsBill: false, status: "none", statementDate: null, dueDate: null, daysLeft: null, estimate: 3500, remainingDue: 3500 });
  });

  it("10/18 填了帳單 3,800、截止日照帳單填 10/25（順延到 10/27）_填帳單那天起繳的才算已繳（10/17 繳的 500 是上一期的）：10/18 繳 1,000 還要繳 2,800", () => {
    const flows = [flow("2026-10-17", { transferIn: 500 }), flow("2026-10-18", { transferIn: 1000 })];

    expect(cardBill(CARD, -2300, flows, "2026-10-20", [bill(2, "2026-10-18", "2026-10-25", 3800)])).toMatchObject({
      statementDate: "2026-10-18",
      dueDate: "2026-10-27",
      statementAmount: 3800,
      paid: 1000,
      remainingDue: 2800,
      needsBill: false,
      status: "upcoming",
      daysLeft: 7,
    });
  });

  it("繳清了_不列，照最新一張寫已繳清", () => {
    expect(cardBill(CARD, 0, [flow("2026-10-18", { transferIn: 3800 })], "2026-10-20", [bill(2, "2026-10-18", "2026-10-27", 3800)])).toMatchObject({ statementDate: "2026-10-18", statementAmount: 3800, remainingDue: 0, status: "none" });
  });

  it("截止日過了還沒繳清_一直是逾期，直到填了下一張（新的帳單會算進沒繳的）", () => {
    const unpaid = [bill(2, "2026-10-18", "2026-10-27", 3800)];

    expect(cardBill(CARD, -3800, [], "2026-10-28", unpaid)).toMatchObject({ statementDate: "2026-10-18", dueDate: "2026-10-27", remainingDue: 3800, status: "overdue", daysLeft: -1 });
    expect(cardBill(CARD, -3800, [], "2026-11-15", unpaid)).toMatchObject({ statementDate: "2026-10-18", status: "overdue", daysLeft: -19 });
    expect(cardBill(CARD, -5000, [], "2026-11-15", [...unpaid, bill(3, "2026-11-15", "2026-11-25", 5000)])).toMatchObject({ statementDate: "2026-11-15", dueDate: "2026-11-25", remainingDue: 5000, status: "upcoming", daysLeft: 10 });
  });

  it("最新一張是 7 月的、7 月就繳清了_繳了多少用帳單紀錄算好的（流量只有近 70 天，不能當成沒繳）", () => {
    expect(cardBill(CARD, -500, [], "2026-10-15", [{ ...bill(1, "2026-07-10", "2026-07-24", 3000), paid: 3000 }])).toMatchObject({ statementDate: "2026-07-10", remainingDue: 0, status: "none" });
  });
});

describe("billDefaults（填帳單視窗的預設）", () => {
  it("有結帳日：填上次結帳那一期，金額照紀錄算到結帳日（結帳後的刷卡與繳款不算），截止日照上一張帳單的日子（別張卡的不算）", () => {
    const flows = [flow("2026-09-28", { expense: 3000 }), flow("2026-10-03", { expense: 2000 }), flow("2026-10-07", { expense: 1500 }), flow("2026-10-10", { transferIn: 4000 })];

    expect(billDefaults({ id: 5, statementDay: 5, dueDay: null }, -7500, flows, "2026-10-15", [bill(1, "2026-09-05", "2026-09-21", 9000), bill(9, "2026-09-05", "2026-09-30", 1, 6)])).toEqual({
      statementDate: "2026-10-05",
      estimate: 10_000,
      dueDate: "2026-10-21",
    });
  });

  it("沒有結帳日：填的那天就是結帳日，金額照紀錄算到前一天（今天刷的 300 不算），還沒有帳單時截止日用舊的設定", () => {
    expect(billDefaults({ id: 5, statementDay: null, dueDay: 25 }, -3800, [flow("2026-10-20", { expense: 300 })], "2026-10-20")).toEqual({
      statementDate: "2026-10-20",
      estimate: 3500,
      dueDate: "2026-10-25",
    });
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

  it("截止日照帳單填的 10/25（週日、10/26 補假）_10/27 還是未繳，10/28 才逾期", () => {
    expect(billStatus({ amount: 6340, paid: 0, dueDate: "2026-10-25" }, "2026-10-27")).toBe("unpaid");
    expect(billStatus({ amount: 6340, paid: 0, dueDate: "2026-10-25" }, "2026-10-28")).toBe("overdue");
  });
});

describe("billPayments（每張帳單繳了多少：結帳日之後到下一張的結帳日為止，最新一張到現在）", () => {
  it("有結帳日：結帳日當天繳的算在前一張（銀行的帳單已經扣掉了）", () => {
    const card = { id: 5, statementDay: 5 };
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
    const card = { id: 5, statementDay: null };
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
