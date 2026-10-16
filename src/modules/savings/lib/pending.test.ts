import { describe, expect, it } from "vitest";
import { cardBill } from "./cards";
import { pendingItems, type PendingContext, type PendingRuleRow } from "./pending";

const TODAY = "2026-10-15";
const CREATED = new Date("2026-08-01T04:00:00Z");

const CONTEXT: PendingContext = {
  accounts: [
    { id: 1, name: "台銀", kind: "deposit", active: true, payFromAccountId: null, autopay: false },
    { id: 2, name: "生活費帳戶", kind: "deposit", active: true, payFromAccountId: null, autopay: false },
    { id: 3, name: "國泰卡", kind: "credit", active: true, payFromAccountId: 2, autopay: false },
    { id: 4, name: "台新卡", kind: "credit", active: true, payFromAccountId: 2, autopay: true },
    { id: 5, name: "臺銀證券", kind: "investment", active: true, payFromAccountId: null, autopay: false },
    { id: 6, name: "舊帳戶", kind: "deposit", active: false, payFromAccountId: null, autopay: false },
  ],
  categories: [{ id: 11, name: "水電" }],
  holdings: [{ id: 21, symbol: "006208" }],
};

const rule = (values: Partial<PendingRuleRow> & Pick<PendingRuleRow, "id" | "dayOfMonth">): PendingRuleRow => ({
  kind: "expense",
  amount: 1800,
  mode: "confirm",
  active: true,
  accountId: 2,
  counterAccountId: null,
  categoryId: null,
  holdingId: null,
  allocate: false,
  name: null,
  note: null,
  intervalMonths: 1,
  startMonth: null,
  holidayRule: "none",
  lastPostedMonth: "2026-09-01",
  createdAt: CREATED,
  ...values,
});

describe("pendingItems（待處理）", () => {
  it("要確認的固定收支只列最舊的一期，laterCount 是之後還有幾期；逾期的 daysLeft 是負的", () => {
    const [item] = pendingItems([rule({ id: 30, dayOfMonth: 5, name: "006208 定期定額", kind: "transfer", accountId: 1, counterAccountId: 5, holdingId: 21, amount: 5000, lastPostedMonth: "2026-08-01" })], [], TODAY, CONTEXT);

    expect(item).toEqual({
      type: "recurring",
      key: "recurring:30:2026-09",
      date: "2026-09-05",
      status: "overdue",
      daysLeft: -40,
      name: "006208 定期定額",
      amount: 5000,
      ruleId: 30,
      period: "2026-09",
      kind: "transfer",
      accountId: 1,
      counterAccountId: 5,
      categoryId: null,
      holdingId: 21,
      allocate: false,
      laterCount: 1,
    });
  });

  it("沒處理的期別超過 12 期_列最舊的那一期，laterCount 算全部（2025-01 起到 10/15 共 22 期）", () => {
    const [item] = pendingItems([rule({ id: 7, dayOfMonth: 5, createdAt: new Date("2025-01-01T04:00:00Z"), lastPostedMonth: null })], [], TODAY, CONTEXT);

    expect(item).toMatchObject({ period: "2025-01", date: "2025-01-05", laterCount: 21 });
  });

  it("今天到期是 today、7 天內是 upcoming、7 天以外還不列", () => {
    const items = pendingItems([rule({ id: 1, dayOfMonth: 15 }), rule({ id: 2, dayOfMonth: 22 }), rule({ id: 3, dayOfMonth: 23 })], [], TODAY, CONTEXT);

    expect(items.map((item) => [item.key, item.status, item.daysLeft])).toEqual([
      ["recurring:1:2026-10", "today", 0],
      ["recurring:2:2026-10", "upcoming", 7],
    ]);
  });

  it("自動記的、停用的、用到停用帳戶的（扣款或轉入）都不列", () => {
    const items = pendingItems(
      [
        rule({ id: 1, dayOfMonth: 10, mode: "auto" }),
        rule({ id: 2, dayOfMonth: 10, active: false }),
        rule({ id: 3, dayOfMonth: 10, accountId: 6 }),
        rule({ id: 4, dayOfMonth: 10, kind: "transfer", accountId: 2, counterAccountId: 6 }),
        rule({ id: 5, dayOfMonth: 10 }),
      ],
      [],
      TODAY,
      CONTEXT,
    );

    expect(items.map((item) => item.key)).toEqual(["recurring:5:2026-10"]);
  });

  it("沒取名的舊規則用紀錄的寫法當名稱（分類）；薪水帶 allocate", () => {
    const items = pendingItems([rule({ id: 1, dayOfMonth: 20, categoryId: 11 }), rule({ id: 2, dayOfMonth: 10, kind: "income", allocate: true, holidayRule: "before", name: "薪水", amount: 52_000 })], [], TODAY, CONTEXT);

    expect(items.map((item) => [item.name, item.date, item.type === "recurring" && item.allocate])).toEqual([
      ["薪水", "2026-10-08", true],
      ["水電", "2026-10-20", false],
    ]);
  });

  it("信用卡：結帳後還沒填帳單是「填帳單」，日期是結帳日、沒有截止日也不算逾期，金額是照紀錄的估計；填了之後照帳單的截止日（遇假日順延）；帶扣款帳戶與自動扣繳", () => {
    // 國泰卡 10/5 結帳 結帳後 10/7 刷 5,910 結帳時的未繳是 12,250 減 5,910 是 6,340
    const cathay = cardBill({ id: 3, statementDay: 5 }, -12_250, [{ accountId: 3, date: "2026-10-07", income: 0, expense: 5910, transferIn: 0, transferOut: 0, adjust: 0 }], TODAY);
    // 台新卡沒有結帳日 10/15 自己填了帳單 截止日 10/25 是週日 10/26 補假 順延到 10/27 還有 12 天
    const taishin = cardBill({ id: 4, statementDay: null }, -3500, [], TODAY, [{ id: 8, accountId: 4, statementDate: "2026-10-15", dueDate: "2026-10-25", amount: 3500 }]);

    expect(pendingItems([], [cathay, taishin], TODAY, CONTEXT)).toEqual([
      { type: "card", key: "card:3:2026-10-05", date: "2026-10-05", status: "needs-bill", daysLeft: -10, name: "國泰卡", amount: 6340, accountId: 3, payFromAccountId: 2, autopay: false, statementDate: "2026-10-05", needsBill: true, estimate: 6340, billId: null },
      { type: "card", key: "card:4:2026-10-15", date: "2026-10-27", status: "upcoming", daysLeft: 12, name: "台新卡", amount: 3500, accountId: 4, payFromAccountId: 2, autopay: true, statementDate: "2026-10-15", needsBill: false, estimate: 3500, billId: 8 },
    ]);
  });

  it("信用卡填了帳單之後：還有要繳的才列（金額是帳單減掉結帳後繳的），過了截止日是逾期；繳清了不列", () => {
    const billed = cardBill({ id: 3, statementDay: 5 }, -12_250, [], TODAY, [{ id: 9, accountId: 3, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12_480 }]);
    const late = cardBill({ id: 3, statementDay: 5 }, -12_250, [], "2026-10-22", [{ id: 9, accountId: 3, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12_480 }]);
    const paidOff = cardBill({ id: 3, statementDay: 5 }, 0, [{ accountId: 3, date: "2026-10-10", income: 0, expense: 0, transferIn: 6340, transferOut: 0, adjust: 0 }], TODAY, [
      { id: 9, accountId: 3, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 6340 },
    ]);

    expect(pendingItems([], [billed], TODAY, CONTEXT)).toMatchObject([{ key: "card:3:2026-10-05", date: "2026-10-20", status: "upcoming", daysLeft: 5, amount: 12_480, needsBill: false, billId: 9 }]);
    expect(pendingItems([], [late], "2026-10-22", CONTEXT)).toMatchObject([{ date: "2026-10-20", status: "overdue", daysLeft: -2 }]);
    expect(pendingItems([], [paidOff], TODAY, CONTEXT)).toEqual([]);
  });

  it("沒有結帳日、還沒填過帳單的卡_不會自動列出填帳單；停用的卡不列", () => {
    const noStatement = cardBill({ id: 4, statementDay: null }, -3500, [], TODAY);
    const cathay = cardBill({ id: 3, statementDay: 5 }, -1000, [], TODAY);
    const inactive = { ...CONTEXT, accounts: CONTEXT.accounts.map((account) => (account.id === 3 ? { ...account, active: false } : account)) };

    expect(pendingItems([], [noStatement], TODAY, CONTEXT)).toEqual([]);
    expect(pendingItems([], [cathay], TODAY, inactive)).toEqual([]);
  });

  it("依日期排，同一天信用卡在前；還沒填帳單的卡照結帳日排（10/5 結帳的排在 10/8 到期的固定收支前面）", () => {
    const cathay = cardBill({ id: 3, statementDay: 5 }, -1000, [], TODAY);
    const items = pendingItems([rule({ id: 9, dayOfMonth: 20 }), rule({ id: 7, dayOfMonth: 8 }), rule({ id: 8, dayOfMonth: 5 })], [cathay], TODAY, CONTEXT);

    expect(items.map((item) => item.key)).toEqual(["card:3:2026-10-05", "recurring:8:2026-10", "recurring:7:2026-10", "recurring:9:2026-10"]);
  });
});
