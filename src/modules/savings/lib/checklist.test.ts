import { describe, expect, it } from "vitest";
import { dayFlowRow, ruleRow } from "../dev/fixtures";
import { cardBill, type CardBill, type CardDailyFlow, type CardStatement } from "./cards";
import { monthChecklist, type ChecklistContext, type ChecklistInput, type ChecklistItem, type ChecklistRecord } from "./checklist";
import type { TransactionKind } from "./kinds";
import { pendingItems, type PendingRuleRow } from "./pending";

// 今天是 2026-10-16 週五 7 天內是到 10/23
// 假日照人事總處的辦公日曆表 10/9 國慶補假 10/26 光復節補假
const TODAY = "2026-10-16";
// 固定收支都是台北 8/1 上午建立的
const CREATED = new Date("2026-08-01T02:00:00Z");

const CONTEXT: ChecklistContext = {
  accounts: [
    { id: 1, name: "生活費帳戶", kind: "deposit", active: true, payFromAccountId: null, statementDay: null },
    { id: 2, name: "台銀", kind: "deposit", active: true, payFromAccountId: null, statementDay: null },
    { id: 3, name: "國泰卡", kind: "credit", active: true, payFromAccountId: 1, statementDay: 5 },
    { id: 4, name: "台新卡", kind: "credit", active: true, payFromAccountId: 1, statementDay: 25 },
    { id: 5, name: "臺銀證券", kind: "investment", active: true, payFromAccountId: null, statementDay: null },
    { id: 6, name: "停用的帳戶", kind: "deposit", active: false, payFromAccountId: null, statementDay: null },
    { id: 7, name: "停用的卡", kind: "credit", active: false, payFromAccountId: null, statementDay: 10 },
    { id: 8, name: "沒有結帳日的卡", kind: "credit", active: true, payFromAccountId: null, statementDay: null },
  ],
  categories: [
    { id: 11, name: "薪水" },
    { id: 12, name: "電費" },
  ],
  holdings: [{ id: 21, symbol: "006208" }],
};

const rule = (id: number, values: Partial<PendingRuleRow> = {}): PendingRuleRow => ruleRow({ id, amount: 1000, name: `規則 ${id}`, dayOfMonth: 1, lastPostedMonth: null, createdAt: CREATED, ...values });

const record = (recurringId: number, recurringPeriod: string | null, date: string, amount: number, kind: TransactionKind = "expense"): ChecklistRecord => ({ recurringId, recurringPeriod, kind, amount, date });


type Statement = CardStatement & { paid: number; lastPaidOn: string | null };
const statement = (accountId: number, statementDate: string, dueDate: string, amount: number, paid = 0, lastPaidOn: string | null = null): Statement => ({ id: accountId * 100, accountId, statementDate, dueDate, amount, paid, lastPaidOn });

/** 每張卡用 cardBill 算最近一期 跟 accountsState 一樣 */
function cardInput(today: string, cards: { id: number; balance: number; flows?: CardDailyFlow[] }[], statements: Statement[] = []) {
  const bills: CardBill[] = cards.map((card) => {
    const account = CONTEXT.accounts.find((candidate) => candidate.id === card.id);
    return cardBill({ id: card.id, statementDay: account?.statementDay ?? null }, card.balance, card.flows ?? [], today, statements);
  });
  return { bills, statements };
}

/** 正式環境每張卡都有算好的最近一期 測試只放有給帳單的卡 */
function checklist(input: Partial<ChecklistInput>, today = TODAY): ChecklistItem[] {
  const cards = new Set((input.bills ?? []).map((bill) => bill.accountId));
  const context = { ...CONTEXT, accounts: CONTEXT.accounts.filter((account) => account.kind !== "credit" || cards.has(account.id)) };
  return monthChecklist({ rules: [], bills: [], statements: [], records: [], context, ...input }, today);
}

const keysOf = (items: ChecklistItem[]) => items.map((item) => item.key);

describe("monthChecklist：固定收支這個月的每一期", () => {
  it("確認過而且有紀錄_完成：寫實際的金額與完成的日期；薪水分出去的轉帳也標了同一期，不算", () => {
    // 每月 10 日遇假日提前 10/10 是週六 10/9 補假 所以是 10/8
    const salary = rule(30, { kind: "income", amount: 52_000, dayOfMonth: 10, holidayRule: "before", allocate: true, categoryId: 11, name: "薪水", lastPostedMonth: "2026-10-01" });
    const records = [record(30, "2026-10-01", "2026-10-08", 5000, "transfer"), record(30, "2026-10-01", "2026-10-08", 52_350, "income")];

    expect(checklist({ rules: [salary], records })).toEqual([
      {
        key: "recurring:30:2026-10",
        kind: "salary",
        date: "2026-10-08",
        title: "薪水",
        amount: 52_350,
        estimated: false,
        state: "done",
        doneOn: "2026-10-08",
        carriedOver: false,
        upcoming: false,
        ruleId: 30,
        cardId: null,
        actionable: false,
        cardStage: null,
      },
    ]);
  });

  it("這一期在游標之前但沒有紀錄_已略過：沒有完成的日期，金額寫原本預計的", () => {
    const gym = rule(31, { amount: 1200, dayOfMonth: 1, name: "健身房", lastPostedMonth: "2026-10-01" });

    expect(checklist({ rules: [gym] })).toMatchObject([{ key: "recurring:31:2026-10", date: "2026-10-01", state: "skipped", doneOn: null, amount: 1200, actionable: false }]);
  });

  it("自動記的：記好了是 auto-done（有期別的照期別對，沒有期別的舊紀錄照日期對）；還沒到是 auto", () => {
    const rules = [
      rule(32, { mode: "auto", amount: 390, dayOfMonth: 12, name: "Netflix", lastPostedMonth: "2026-10-01" }),
      rule(33, { mode: "auto", amount: 599, dayOfMonth: 28, name: "手機費", lastPostedMonth: "2026-09-01" }),
      rule(35, { mode: "auto", amount: 300, dayOfMonth: 3, lastPostedMonth: "2026-10-01" }),
    ];
    const records = [record(32, null, "2026-09-12", 390), record(32, null, "2026-10-12", 390), record(35, "2026-10-01", "2026-10-03", 300)];

    const items = checklist({ rules, records });

    expect(items.map((item) => [item.key, item.state, item.doneOn, item.amount, item.actionable])).toEqual([
      ["recurring:35:2026-10", "auto-done", "2026-10-03", 300, false],
      ["recurring:32:2026-10", "auto-done", "2026-10-12", 390, false],
      ["recurring:33:2026-10", "auto", null, 599, false],
    ]);
  });

  it("沒有期別的舊紀錄日期對不上（後來改了每月的日期）_已略過", () => {
    const changed = rule(34, { mode: "auto", dayOfMonth: 15, lastPostedMonth: "2026-10-01" });

    expect(checklist({ rules: [changed], records: [record(34, null, "2026-10-12", 1000)] })).toMatchObject([{ date: "2026-10-15", state: "skipped" }]);
  });

  it("要確認的還沒處理：過了是逾期、還沒到是要處理；7 天內（到 10/23）的才按得了", () => {
    const rules = [
      rule(40, { kind: "transfer", accountId: 2, counterAccountId: 5, holdingId: 21, amount: 5000, dayOfMonth: 5, name: null, lastPostedMonth: "2026-09-01" }),
      rule(41, { amount: 1350, dayOfMonth: 20, intervalMonths: 2, startMonth: "2026-08-01", categoryId: 12, name: null, lastPostedMonth: "2026-08-01" }),
      rule(42, { dayOfMonth: 28, lastPostedMonth: "2026-09-01" }),
    ];

    expect(checklist({ rules }).map((item) => [item.key, item.kind, item.title, item.date, item.state, item.actionable])).toEqual([
      ["recurring:40:2026-10", "recurring", "006208 定期定額", "2026-10-05", "overdue", true],
      ["recurring:41:2026-10", "recurring", "電費", "2026-10-20", "todo", true],
      ["recurring:42:2026-10", "recurring", "規則 42", "2026-10-28", "todo", false],
    ]);
  });

  it("每 2 個月一次（8 月起）_9 月不是它的期別，沒有上個月沒處理的", () => {
    const power = rule(41, { dayOfMonth: 20, intervalMonths: 2, startMonth: "2026-08-01", lastPostedMonth: "2026-08-01" });

    expect(keysOf(checklist({ rules: [power] }))).toEqual(["recurring:41:2026-10"]);
  });

  it("要確認的上個月沒處理_排在最上面標上個月（逾期、按得了）；這個月那一期要等上個月的處理完才按得了", () => {
    const rent = rule(50, { dayOfMonth: 20, lastPostedMonth: "2026-08-01" });

    expect(checklist({ rules: [rent] }).map((item) => [item.key, item.date, item.state, item.carriedOver, item.actionable])).toEqual([
      ["recurring:50:2026-09", "2026-09-20", "overdue", true, true],
      ["recurring:50:2026-10", "2026-10-20", "todo", false, false],
    ]);
  });

  it("自動記的上個月沒記到（排程沒跑）_不算上個月沒處理，只列這個月的自動記帳", () => {
    const auto = rule(51, { mode: "auto", dayOfMonth: 20, lastPostedMonth: "2026-08-01" });

    expect(checklist({ rules: [auto] }).map((item) => [item.key, item.state, item.carriedOver])).toEqual([["recurring:51:2026-10", "auto", false]]);
  });

  it("建立之前的日期不算：10/10 才建立的每月 5 日，這個月沒有它", () => {
    expect(checklist({ rules: [rule(52, { dayOfMonth: 5, createdAt: new Date("2026-10-10T02:00:00Z") })] })).toEqual([]);
  });

  it("停用的固定收支、用到停用帳戶的（轉入也算）_都不列", () => {
    const rules = [rule(53, { active: false, dayOfMonth: 20 }), rule(54, { accountId: 6, dayOfMonth: 20 }), rule(55, { kind: "transfer", counterAccountId: 6, dayOfMonth: 20 })];

    expect(checklist({ rules })).toEqual([]);
  });
});

describe("monthChecklist：月底看到下個月 7 天內的", () => {
  // 10/28 週三 7 天內是到 11/4
  const LATE = "2026-10-28";

  it("11/3 要確認的_下個月的標 upcoming、按得了；11/5 的超過 7 天不列", () => {
    const rules = [rule(60, { dayOfMonth: 3, lastPostedMonth: "2026-10-01" }), rule(61, { dayOfMonth: 5, lastPostedMonth: "2026-10-01" })];
    const records = [record(60, "2026-10-01", "2026-10-03", 1000), record(61, "2026-10-01", "2026-10-05", 1000)];

    expect(checklist({ rules, records }, LATE).map((item) => [item.key, item.state, item.upcoming, item.actionable])).toEqual([
      ["recurring:60:2026-10", "done", false, false],
      ["recurring:61:2026-10", "done", false, false],
      ["recurring:60:2026-11", "todo", true, true],
    ]);
  });

  it("下個月的那一期已經提早確認_upcoming 而且完成，寫確認的那天", () => {
    const early = rule(63, { dayOfMonth: 2, lastPostedMonth: "2026-11-01" });
    const records = [record(63, "2026-10-01", "2026-10-02", 1000), record(63, "2026-11-01", "2026-10-28", 1000)];

    expect(checklist({ rules: [early], records }, LATE).map((item) => [item.key, item.date, item.state, item.doneOn, item.upcoming])).toEqual([
      ["recurring:63:2026-10", "2026-10-02", "done", "2026-10-02", false],
      ["recurring:63:2026-11", "2026-11-02", "done", "2026-10-28", true],
    ]);
  });

  it("遇假日提前跨到這個月的下一期（11/1 是週日，提前到 10/30）_算這個月的，期別還是 11 月", () => {
    const first = rule(62, { mode: "auto", dayOfMonth: 1, holidayRule: "before", lastPostedMonth: "2026-10-01" });

    expect(checklist({ rules: [first], records: [record(62, "2026-10-01", "2026-10-01", 1000)] }, LATE).map((item) => [item.key, item.date, item.state, item.upcoming])).toEqual([
      ["recurring:62:2026-10", "2026-10-01", "auto-done", false],
      ["recurring:62:2026-11", "2026-10-30", "auto", false],
    ]);
  });
});

describe("monthChecklist：信用卡待填帳單照結帳日、填了之後照截止日", () => {
  // 國泰卡每月 5 日結帳 結帳後沒有新的紀錄 目前未繳 3,370 就是 10/5 的未繳
  it("結帳了還沒填帳單_要處理（按得了）：日期是結帳日，金額是照紀錄估的", () => {
    expect(checklist(cardInput(TODAY, [{ id: 3, balance: -3370 }]))).toEqual([
      {
        key: "card:3:2026-10-05",
        kind: "card",
        date: "2026-10-05",
        title: "國泰卡",
        amount: 3370,
        estimated: true,
        state: "todo",
        doneOn: null,
        carriedOver: false,
        upcoming: false,
        ruleId: null,
        cardId: 3,
        actionable: true,
        cardStage: "needs-bill",
      },
    ]);
  });

  it("填了帳單還沒繳清_日期是截止日、金額是還要繳的；過了截止日是逾期；印的截止日遇假日照順延後的（10/25 → 10/27）", () => {
    const due = (dueDate: string) => checklist(cardInput(TODAY, [{ id: 3, balance: -3370 }], [statement(3, "2026-10-05", dueDate, 3370)]));

    expect(due("2026-10-20")).toMatchObject([{ key: "card:3:2026-10-05", date: "2026-10-20", state: "todo", amount: 3370, estimated: false, actionable: true, cardStage: "unpaid" }]);
    expect(due("2026-10-12")).toMatchObject([{ date: "2026-10-12", state: "overdue", actionable: true }]);
    expect(due("2026-10-25")).toMatchObject([{ date: "2026-10-27", state: "todo" }]);
  });

  it("繳了一部分_金額是還要繳的（帳單 3,370、繳了 1,000 → 2,370）", () => {
    const flows = [dayFlowRow(3, "2026-10-10", { transferIn: 1000 })];

    expect(checklist(cardInput(TODAY, [{ id: 3, balance: -2370, flows }], [statement(3, "2026-10-05", "2026-10-20", 3370, 1000, "2026-10-10")]))).toMatchObject([{ amount: 2370, state: "todo" }]);
  });

  it("繳清了_完成：寫帳單金額與最後繳款的那天；0 元的帳單沒有繳款，寫結帳日", () => {
    const paid = cardInput(TODAY, [{ id: 3, balance: 0, flows: [dayFlowRow(3, "2026-10-14", { transferIn: 3370 })] }], [statement(3, "2026-10-05", "2026-10-20", 3370, 3370, "2026-10-14")]);
    const zero = cardInput(TODAY, [{ id: 3, balance: 0 }], [statement(3, "2026-10-05", "2026-10-20", 0)]);

    expect(checklist(paid)).toMatchObject([{ key: "card:3:2026-10-05", date: "2026-10-20", state: "done", amount: 3370, doneOn: "2026-10-14", actionable: false, cardStage: "paid" }]);
    expect(checklist(zero)).toMatchObject([{ state: "done", amount: 0, doneOn: "2026-10-05" }]);
  });

  it("這個月還沒結帳（台新卡 25 日）_列出結帳日（還不能填，沒有金額）；上個月 9/25 那一期還沒填帳單，排在最上面標上個月", () => {
    // 9/25 之後刷了 280 與 360 目前未繳 5,830 所以 9/25 的未繳是 5,190
    const flows = [dayFlowRow(4, "2026-10-02", { expense: 280 }), dayFlowRow(4, "2026-10-11", { expense: 360 })];

    expect(checklist(cardInput(TODAY, [{ id: 4, balance: -5830, flows }])).map((item) => [item.key, item.date, item.state, item.amount, item.estimated, item.carriedOver, item.actionable, item.cardStage])).toEqual([
      ["card:4:2026-09-25", "2026-09-25", "todo", 5190, true, true, true, "needs-bill"],
      ["card:4:2026-10-25", "2026-10-25", "todo", null, false, false, false, "unbilled"],
    ]);
  });

  it("上個月結帳、這個月截止的那一期繳清了_算這個月的，留著打勾（照截止日排）", () => {
    const paid = cardInput(TODAY, [{ id: 4, balance: -640 }], [statement(4, "2026-09-25", "2026-10-12", 5190, 5190, "2026-10-10")]);

    expect(checklist(paid).map((item) => [item.key, item.date, item.state, item.doneOn, item.carriedOver, item.cardStage])).toEqual([
      ["card:4:2026-09-25", "2026-10-12", "done", "2026-10-10", false, "paid"],
      ["card:4:2026-10-25", "2026-10-25", "todo", null, false, "unbilled"],
    ]);
  });

  it("上個月結帳、這個月截止還沒繳_不算上個月沒處理：照截止日列，過了是逾期", () => {
    const unpaid = cardInput(TODAY, [{ id: 4, balance: -5190 }], [statement(4, "2026-09-25", "2026-10-12", 5190)]);

    expect(checklist(unpaid)).toMatchObject([{ key: "card:4:2026-09-25", date: "2026-10-12", state: "overdue", carriedOver: false, actionable: true, cardStage: "unpaid" }, { cardStage: "unbilled" }]);
  });

  it("這個月結帳了還沒填（10/25），前一期 10/12 截止已繳清_兩期都列：繳清的打勾、這一期待填帳單", () => {
    // 10/26 光復節補假 今天 10/27
    const today = "2026-10-27";
    const items = checklist(cardInput(today, [{ id: 4, balance: -640, flows: [dayFlowRow(4, "2026-10-10", { transferIn: 5190 })] }], [statement(4, "2026-09-25", "2026-10-12", 5190, 5190, "2026-10-10")]), today);

    expect(items.map((item) => [item.key, item.date, item.state, item.actionable, item.cardStage])).toEqual([
      ["card:4:2026-09-25", "2026-10-12", "done", false, "paid"],
      ["card:4:2026-10-25", "2026-10-25", "todo", true, "needs-bill"],
    ]);
  });

  it("月底結帳、帳單截止日在下個月（10/25 結帳、11/12 截止）_待繳與繳清都跟其他下個月的一樣標 upcoming（畫面把下個月的照日期排在這個月的後面）", () => {
    const today = "2026-10-28";
    const unpaid = cardInput(today, [{ id: 4, balance: -5830 }], [statement(4, "2026-10-25", "2026-11-12", 5830)]);
    const paid = cardInput(today, [{ id: 4, balance: 0, flows: [dayFlowRow(4, "2026-10-27", { transferIn: 5830 })] }], [statement(4, "2026-10-25", "2026-11-12", 5830, 5830, "2026-10-27")]);
    const row = (item: ChecklistItem) => [item.key, item.date, item.state, item.carriedOver, item.upcoming];

    expect(checklist(unpaid, today).map(row)).toEqual([["card:4:2026-10-25", "2026-11-12", "todo", false, true]]);
    expect(checklist(paid, today).map(row)).toEqual([["card:4:2026-10-25", "2026-11-12", "done", false, true]]);
  });

  it("前一期在上個月截止、或沒繳清（會併進這一期）_不列", () => {
    const today = "2026-10-27";
    const early = cardInput(today, [{ id: 3, balance: 0 }], [statement(3, "2026-09-05", "2026-09-20", 900, 900, "2026-09-18")]);
    const merged = cardInput(today, [{ id: 4, balance: -5830 }], [statement(4, "2026-09-25", "2026-10-12", 5190)]);

    expect(keysOf(checklist(early, today))).toEqual(["card:3:2026-10-05"]);
    expect(keysOf(checklist(merged, today))).toEqual(["card:4:2026-10-25"]);
  });

  it("結帳日當天還沒結帳（今天結帳的要明天才算出來）", () => {
    expect(keysOf(checklist(cardInput("2026-10-25", [{ id: 4, balance: 0 }]), "2026-10-25"))).toEqual(["card:4:2026-09-25", "card:4:2026-10-25"]);
  });

  it("月底看到下個月 7 天內的結帳日（10/30 看到 11/5，標 upcoming）；台新卡的 11/25 太遠不列", () => {
    const items = checklist(cardInput("2026-10-30", [{ id: 3, balance: 0 }, { id: 4, balance: 0 }]), "2026-10-30");

    expect(items.map((item) => [item.key, item.upcoming, item.cardStage])).toEqual([
      ["card:3:2026-10-05", false, "needs-bill"],
      ["card:4:2026-10-25", false, "needs-bill"],
      ["card:3:2026-11-05", true, "unbilled"],
    ]);
  });

  it("沒有結帳日的卡：沒填過帳單不列；這個月填的帳單照截止日列；以前填的繳清了不列", () => {
    expect(checklist(cardInput(TODAY, [{ id: 8, balance: -500 }]))).toEqual([]);
    expect(checklist(cardInput(TODAY, [{ id: 8, balance: -500 }], [statement(8, "2026-10-03", "2026-10-20", 500)]))).toMatchObject([{ key: "card:8:2026-10-03", date: "2026-10-20", state: "todo", cardStage: "unpaid" }]);
    expect(checklist(cardInput(TODAY, [{ id: 8, balance: 0 }], [statement(8, "2026-08-20", "2026-09-04", 500, 500, "2026-09-01")]))).toEqual([]);
  });

  it("停用的卡_不列", () => {
    expect(checklist(cardInput(TODAY, [{ id: 7, balance: -900 }]))).toEqual([]);
  });
});

describe("monthChecklist：排序與待處理", () => {
  it("上個月沒處理的在最上面，其他照日期；同一天信用卡在前", () => {
    const rules = [rule(70, { dayOfMonth: 5, lastPostedMonth: "2026-09-01" }), rule(71, { dayOfMonth: 25, lastPostedMonth: "2026-08-01" })];
    const cards = cardInput(TODAY, [{ id: 3, balance: -3370 }, { id: 4, balance: 0 }]);

    expect(keysOf(checklist({ rules, ...cards }))).toEqual([
      "card:4:2026-09-25",
      "recurring:71:2026-09",
      "card:3:2026-10-05",
      "recurring:70:2026-10",
      "card:4:2026-10-25",
      "recurring:71:2026-10",
    ]);
  });

  it("待處理的每一列都在這個月要做的事裡、而且按得了（key 一樣）；按得了的也都在待處理裡", () => {
    const rules = [
      rule(80, { dayOfMonth: 20, lastPostedMonth: "2026-08-01" }),
      rule(81, { dayOfMonth: 5, lastPostedMonth: "2026-09-01" }),
      rule(82, { mode: "auto", dayOfMonth: 12, lastPostedMonth: "2026-09-01" }),
      rule(83, { kind: "income", allocate: true, dayOfMonth: 10, holidayRule: "before", lastPostedMonth: "2026-10-01" }),
    ];
    const cards = cardInput(TODAY, [{ id: 3, balance: -3370 }, { id: 4, balance: -100 }, { id: 8, balance: -500 }], [statement(8, "2026-10-03", "2026-10-18", 500)]);

    const items = checklist({ rules, ...cards });
    const pending = pendingItems(rules, cards.bills, TODAY, CONTEXT);

    expect(pending.length).toBeGreaterThan(0);
    expect(items.filter((item) => item.actionable).map((item) => item.key).sort()).toEqual(pending.map((item) => item.key).sort());
  });
});
