import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillDraft, HoldingView, PendingEntry } from "../../dashboard-view";
import type { ChecklistRow, QuickActionsView } from "../../overview-view";

// 視窗與選單關著時不算繪內容 換掉才看得到裡面 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/action-button", { spy: true });
vi.mock("@/core/ui/more-menu", () => ({ MoreMenu: ({ children }: { children: ReactNode }) => createElement("div", { "data-menu": "" }, children) }));
// Server Action 換成假的 只看每個表單接到哪一個
vi.mock("../../actions", () =>
  Object.fromEntries(
    [
      "addTransactionAction",
      "allocateSalaryAction",
      "buyHoldingAction",
      "confirmOccurrenceAction",
      "createHoldingAction",
      "enterCardBillAction",
      "payCardAction",
      "sellHoldingAction",
      "setupAction",
      "skipOccurrenceAction",
      "updateBalanceAction",
      "updateHoldingAction",
    ].map((name) => [name, vi.fn()]),
  ),
);
const report = vi.fn();
vi.mock("../dashboard/overview-notice", () => ({ useOverviewNotice: () => report }));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const { MonthChecklist } = await import("./month-checklist");
const { QuickActions, QuickActionBody } = await import("./quick-actions");
const { SetupChecklist } = await import("./setup-checklist");

const TODAY = "2026-10-15";
const render = (element: ReactNode) => renderToStaticMarkup(element as never);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const valueOf = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0].match(/value="([^"]*)"/)?.[1];
const formActions = () => vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action);
const linkTo = (markup: string, text: string) => markup.match(new RegExp(`<a [^>]*href="([^"]*)"[^>]*>(?:(?!</a>).)*${text}`))?.[1]?.replace(/&amp;/g, "&");

const DEPOSITS = [
  { id: 1, name: "台銀", kind: "deposit" as const },
  { id: 2, name: "生活費帳戶", kind: "deposit" as const },
];

beforeEach(() => {
  report.mockClear();
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
});

describe("這個月要做的事", () => {
  const BILL: BillDraft = { cardId: 6, cardName: "國泰卡", estimate: 12480, statementDate: "2026-10-05", dueDate: "2026-10-27", payFromAccountId: 2, minDate: "2026-01-05" };
  const entryRow = (key: string, action: "bill" | "pay" | "confirm" | "allocate") => ({ key, action });
  const ENTRIES: Record<string, PendingEntry> = {
    bill: { row: entryRow("card:6:2026-10-05", "bill"), rule: null, bill: BILL },
    pay: { row: entryRow("card:7:2026-09-25", "pay"), rule: null, pay: { cardId: 7, cardName: "台新卡", amount: 3200, payFromAccountId: 2, minDate: "2026-01-05" } },
    confirm: {
      row: entryRow("recurring:3:2026-10", "confirm"),
      rule: { ruleId: 3, period: "2026-10" },
      confirm: { ruleId: 3, period: "2026-10", name: "電費", kind: "expense", amount: 1800, date: TODAY, minDate: "2026-01-05", where: "生活費帳戶 · 帳單", notePlaceholder: "留空會寫「電費」", regularBuy: null },
    },
    allocate: { row: entryRow("recurring:1:2026-10", "allocate"), rule: { ruleId: 1, period: "2026-10" }, salary: { ruleId: 1, period: "2026-10", amount: 52000, accountId: 2, categoryId: null, date: "2026-10-10" } },
  };
  const row = (key: string, title: string, state: ChecklistRow["state"], entry: PendingEntry | null = null, badge: ChecklistRow["badge"] = null): ChecklistRow => ({ key, title, state, meta: "", amountText: "$1", badge, entry });
  const ROWS = [
    row("card:7:2026-09-25", "台新卡", "overdue", ENTRIES.pay, { label: "逾期 20 天", tone: "danger" }),
    row("card:6:2026-10-05", "國泰卡", "todo", ENTRIES.bill),
    row("recurring:1:2026-10", "薪水", "todo", ENTRIES.allocate),
    row("recurring:3:2026-10", "電費", "todo", ENTRIES.confirm),
    row("recurring:5:2026-10", "Netflix", "auto-done"),
    row("recurring:7:2026-10", "健身房", "skipped"),
    row("recurring:8:2026-10", "手機費", "auto"),
    row("recurring:9:2026-10", "保險", "done"),
  ];
  const list = (rows = ROWS) =>
    render(
      createElement(MonthChecklist, {
        rows,
        payFromAccounts: DEPOSITS,
        salaryAccounts: DEPOSITS.map((account) => ({ ...account, balance: 0, monthlyPlan: null, targetAmount: null, sortOrder: account.id })),
        categories: [{ id: 11, name: "餐飲", kind: "expense" }],
        today: TODAY,
      }),
    );

  it("要處理的列各有一顆按鈕（已繳、填帳單、入帳並分配、確認），逾期的有標籤；做完、略過、自動記帳的沒有按鈕", () => {
    const markup = list();
    const buttons = [...markup.matchAll(/<button[^>]*aria-label="([^"]*)"[^>]*class="btn-secondary btn-sm"/g)].map((m) => m[1]);

    expect(buttons).toEqual(["已繳：台新卡", "填帳單：國泰卡", "入帳並分配：薪水", "確認：電費"]);
    expect(textOf(markup)).toContain("逾期 20 天");
  });

  it("已繳、填帳單、入帳並分配、確認成功後那一列的按鈕會不見：訊息交給外面的 OverviewNotice", () => {
    list();
    const forms = vi.mocked(dialog.useDialogForm).mock.calls;

    expect(forms.map(([action]) => action)).toEqual([actions.payCardAction, expect.any(Function), actions.allocateSalaryAction, actions.confirmOccurrenceAction]);
    forms.forEach(([, onDone], i) => onDone(`訊息 ${i}`, {}));
    expect(report.mock.calls).toEqual([["訊息 0"], ["訊息 1"], ["訊息 2"], ["訊息 3"]]);
  });

  it("還沒填帳單的卡打開的是填帳單（不是繳款），截止日先填好預設", async () => {
    const markup = list([ROWS[1]]);
    const [[submit]] = vi.mocked(dialog.useDialogForm).mock.calls;
    const filled = new FormData();
    filled.set("amount", "12480");

    expect(valueOf(markup, "dueDate")).toBe("2026-10-27");
    await submit({}, filled);
    expect(actions.enterCardBillAction).toHaveBeenCalledWith({}, filled);
  });

  it("固定收支的 ⋮：略過這一期先確認，送出規則與那一期，成功後訊息也交給外面；修改打開每月固定頁的那一條；信用卡沒有 ⋮", async () => {
    const markup = list();
    const skips = vi.mocked(ActionButton).mock.calls.map(([props]) => props);
    vi.mocked(actions.skipOccurrenceAction).mockResolvedValue({ message: "已略過" });

    expect(skips.map((props) => props.fields)).toEqual([
      { ruleId: 1, period: "2026-10" },
      { ruleId: 3, period: "2026-10" },
    ]);
    expect(skips[0].confirmMessage).toContain("2026 年 10 月");
    await skips[0].action({}, new FormData());
    expect(report).toHaveBeenCalledWith("已略過");
    expect([...markup.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>).)*修改/g)].map((m) => m[1])).toEqual(["/savings/recurring?edit=1", "/savings/recurring?edit=3"]);
  });
});

const holding = (id: number, symbol: string): HoldingView => ({
  id,
  symbol,
  name: `${symbol} 名稱`,
  shares: 1000,
  cost: 95000,
  closeCents: 10650,
  quoteDate: "2026-10-14",
  value: 106500,
  profit: 11500,
  profitPercent: 12.1,
  priced: true,
  settlementAccountId: 1,
});
const card = (id: number, name: string, needsBill: boolean) => ({
  id,
  name,
  status: needsBill ? "10/5 已結帳 · 待填帳單" : "10/20 截止",
  needsBill,
  bill: { cardId: id, cardName: name, estimate: 7000, statementDate: "2026-10-05", dueDate: "2026-10-27", payFromAccountId: 2, minDate: "2026-01-05" },
  pay: { cardId: id, cardName: name, amount: 7000, payFromAccountId: 2, minDate: "2026-01-05" },
});
const VIEW: QuickActionsView = {
  entry: { accounts: DEPOSITS, categories: [{ id: 11, name: "餐飲", kind: "expense" }], today: TODAY },
  cards: [card(6, "國泰卡", true), card(7, "台新卡", false)],
  holdings: [{ holding: holding(1, "006208"), accountName: "臺銀證券", minDate: "2026-01-05" }],
  balances: [
    { id: 1, name: "台銀", kind: "deposit", balance: 8300 },
    { id: 2, name: "生活費帳戶", kind: "deposit", balance: 124000 },
  ],
  depositAccounts: DEPOSITS,
  categories: [{ id: 11, name: "餐飲", kind: "expense" }],
  hasInvestmentAccount: true,
  today: TODAY,
};
const body = (action: Parameters<typeof QuickActionBody>[0]["action"], view: Partial<QuickActionsView> = {}) => render(createElement(QuickActionBody, { action, view: { ...VIEW, ...view }, onDone: vi.fn(), onCancel: vi.fn() }));

describe("我要…", () => {
  it("六個按鈕照順序：記支出、記收入、轉帳、信用卡、買賣股票、更新餘額，按了都打開視窗", () => {
    const markup = render(createElement(QuickActions, { view: VIEW }));
    const buttons = [...markup.matchAll(/<button[^>]*class="fin-action"[^>]*>(.*?)<\/button>/g)];

    expect(buttons.map((m) => textOf(m[1]))).toEqual(["記支出", "記收入", "轉帳", "信用卡", "買賣股票", "更新餘額"]);
    expect(buttons.every((m) => m[0].includes('aria-haspopup="dialog"'))).toBe(true);
  });

  it("記支出、記收入、轉帳打開記一筆，類型先選好", () => {
    for (const [action, label] of [
      ["expense", "支出"],
      ["income", "收入"],
      ["transfer", "轉帳"],
    ] as const) {
      expect(body(action)).toMatch(new RegExp(`<button[^>]*aria-pressed="true"[^>]*>${label}</button>`));
    }
    expect(formActions()).toEqual([actions.addTransactionAction, actions.addTransactionAction, actions.addTransactionAction]);
  });

  it("信用卡有兩張以上：先選哪一張，還沒有表單", () => {
    const markup = body("card");

    expect(textOf(markup)).toContain("國泰卡");
    expect(textOf(markup)).toContain("台新卡");
    expect(formActions()).toEqual([]);
  });

  it("只有一張卡時直接打開表單：還沒填這一期的帳單是填帳單，填了是繳卡費", async () => {
    body("card", { cards: [card(6, "國泰卡", true)] });
    const [[submitBill]] = vi.mocked(dialog.useDialogForm).mock.calls;
    await submitBill({}, new FormData());
    expect(actions.enterCardBillAction).toHaveBeenCalled();

    vi.mocked(dialog.useDialogForm).mockClear();
    body("card", { cards: [card(7, "台新卡", false)] });
    expect(formActions()).toEqual([actions.payCardAction]);
  });

  it("沒有可以選的對象：按鈕照樣在，視窗裡說明並連到新增的頁面", () => {
    expect(linkTo(body("card", { cards: [] }), "新增信用卡")).toBe("/savings/accounts?add=credit");
    expect(linkTo(body("trade", { holdings: [], hasInvestmentAccount: false }), "新增證券帳戶")).toBe("/savings/investments?add=investment");
    expect(linkTo(body("trade", { holdings: [] }), "前往投資")).toBe("/savings/investments");
    expect(linkTo(body("balance", { balances: [] }), "新增銀行帳戶")).toBe("/savings/accounts?add=deposit");
  });

  it("買賣股票只有一檔：直接打開買進，送出這一檔", () => {
    const markup = body("trade");

    expect(formActions()).toEqual([actions.buyHoldingAction]);
    expect(valueOf(markup, "holdingId")).toBe("1");
  });

  it("賣光的那一檔（0 股）只能買進，跟投資頁一樣不能選賣出", () => {
    const soldOut = body("trade", { holdings: [{ holding: { ...holding(1, "006208"), shares: 0 }, accountName: "臺銀證券", minDate: "2026-01-05" }] });

    expect(soldOut).not.toMatch(/<button[^>]*>賣出<\/button>/);
    expect(body("trade")).toMatch(/<button[^>]*>賣出<\/button>/);
  });

  it("更新餘額要先選帳戶；只有一個時直接打開，送出這個帳戶", () => {
    const picker = textOf(body("balance"));
    expect(picker).toContain("台銀");
    expect(picker).toContain("生活費帳戶");
    expect(formActions()).toEqual([]);

    const markup = body("balance", { balances: [{ id: 2, name: "生活費帳戶", kind: "deposit", balance: 124000 }] });
    expect(formActions()).toEqual([actions.updateBalanceAction]);
    expect(valueOf(markup, "accountId")).toBe("2");
  });
});

describe("開始設定", () => {
  const status = (done: string[]) => (["deposit", "credit", "investment", "salary", "recurring"] as const).map((step) => ({ step, done: done.includes(step) }));
  const setup = (done: string[], extra: { needsCategories?: boolean; required?: boolean } = {}) =>
    render(createElement(SetupChecklist, { view: { status: status(done), needsCategories: false, required: false, ...extra } }));

  it("五步照順序，還沒做的每一步連到對應頁面並打開新增的視窗；最上面寫已完成幾步", () => {
    const markup = setup(["deposit", "salary"]);

    expect(textOf(markup)).toContain("已完成 2/5");
    const stepLinks = [...markup.matchAll(/<a [^>]*>/g)].map((m) => m[0]).filter((tag) => tag.includes("data-step-link"));
    expect(stepLinks.map((tag) => tag.match(/href="([^"]*)"/)?.[1].replace(/&amp;/g, "&"))).toEqual([
      "/savings/accounts?add=credit",
      "/savings/investments?add=investment",
      "/savings/recurring?add=other",
    ]);
  });

  it("還沒有帳戶時第一步是新增銀行帳戶，薪水連到每月固定頁的新增薪水", () => {
    const markup = setup([], { required: true });

    expect(linkTo(markup, "新增銀行帳戶")).toBe("/savings/accounts?add=deposit");
    expect(linkTo(markup, "設定薪水")).toBe("/savings/recurring?add=salary");
  });

  it("還沒有分類時，清單上面先有「開始使用」建預設分類", async () => {
    vi.mocked(actions.setupAction).mockResolvedValue({});
    setup([], { needsCategories: true, required: true });
    const [[props]] = vi.mocked(ActionButton).mock.calls;

    await props.action({}, new FormData());
    expect(actions.setupAction).toHaveBeenCalledOnce();
  });
});
