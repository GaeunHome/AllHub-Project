import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreditDetail, DepositDetail, HoldingView, InvestmentDetail } from "../../dashboard-view";

// 視窗與選單關著時不算繪內容 換掉才看得到裡面 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/action-button", { spy: true });
vi.mock("@/core/ui/more-menu", () => ({ MoreMenu: ({ children }: { children: ReactNode }) => createElement("div", { "data-menu": "" }, children) }));
vi.mock("../../actions", () =>
  Object.fromEntries(["createHoldingAction", "updateHoldingAction", "deleteHoldingAction", "buyHoldingAction", "sellHoldingAction", "payCardAction", "enterCardBillAction"].map((name) => [name, vi.fn()])),
);
// 刪除持股的訊息要看交給誰 換成記下訊息的替身
vi.mock("../row-controls", { spy: true });
// 記一筆與更新餘額另外測 這裡只看詳情交給它們什麼
vi.mock("../forms/quick-add", () => ({ QuickAddButton: (p: { accountId?: number }) => createElement("button", { "data-form": "quick-add", "data-account": p.accountId }, "記一筆") }));
vi.mock("../forms/update-balance", () => ({
  UpdateBalanceButton: (p: { account: { id: number; kind: string; balance: number } }) =>
    createElement("button", { "data-form": "update-balance", "data-account": p.account.id, "data-kind": p.account.kind, "data-balance": p.account.balance }, "更新餘額"),
}));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const rowControls = await import("../row-controls");
const { Holdings } = await import("./holdings");
const { AddHoldingForm, EditHoldingForm, BuySellForm } = await import("./holding-forms");
const { AccountDetailBody } = await import("./account-detail");
const { BillForm } = await import("./card-bill");

const TODAY = "2026-10-15";
const render = (element: ReactNode) => renderToStaticMarkup(element as never);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const inputOf = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
const valueOf = (markup: string, name: string) => inputOf(markup, name).match(/value="([^"]*)"/)?.[1];
const selectedOption = (markup: string, name: string) => markup.match(new RegExp(`<select[^>]*name="${name}"[^>]*>[\\s\\S]*?</select>`))?.[0].match(/<option[^>]*selected=""[^>]*>([^<]*)<\/option>/)?.[1];
const fieldNames = (markup: string) => [...new Set([...markup.matchAll(/<(?:input|select)[^>]*name="([^"]+)"/g)].map((m) => m[1]))].sort();
const formActions = () => vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action);
const entryPoint = (markup: string, form: "quick-add" | "update-balance") => markup.match(new RegExp(`<button data-form="${form}"[^>]*>`))?.[0];

const DEPOSITS = [
  { id: 1, name: "台銀", kind: "deposit" as const },
  { id: 2, name: "生活費帳戶", kind: "deposit" as const },
];
const HOLDING: HoldingView = {
  id: 9,
  symbol: "006208",
  name: "富邦台50",
  shares: 1000,
  cost: 95000,
  closeCents: 10650,
  quoteDate: "2026-10-14",
  value: 106500,
  profit: 11500,
  profitPercent: 12.1,
  priced: true,
  settlementAccountId: 1,
};
const done = { onDone: vi.fn(), onCancel: vi.fn() };
const context = { options: { accounts: [...DEPOSITS, { id: 4, name: "臺銀證券", kind: "investment" as const, startDate: "2026-01-05" }], categories: [], today: TODAY }, depositAccounts: DEPOSITS, today: TODAY };

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(rowControls.useRemovalNotice).mockRestore();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
});

describe("持股的表單", () => {
  it("新增持股：照券商 App 的庫存填代號、目前股數與總成本，送到 createHoldingAction", () => {
    const markup = render(createElement(AddHoldingForm, { accountId: 4, ...done }));

    expect(fieldNames(markup)).toEqual(["accountId", "cost", "shares", "symbol"]);
    expect(valueOf(markup, "accountId")).toBe("4");
    expect(formActions()).toEqual([actions.createHoldingAction]);
  });

  it("修改股數與成本：先填目前的值，送到 updateHoldingAction", () => {
    const markup = render(createElement(EditHoldingForm, { holding: HOLDING, ...done }));

    expect(fieldNames(markup)).toEqual(["cost", "id", "shares"]);
    expect([valueOf(markup, "id"), valueOf(markup, "shares"), valueOf(markup, "cost")]).toEqual(["9", "1000", "95000"]);
    expect(formActions()).toEqual([actions.updateHoldingAction]);
  });

  it("買進：從存款帳戶扣款（預設定期定額的扣款帳戶），金額是實際扣款含手續費，送到 buyHoldingAction", () => {
    const markup = render(createElement(BuySellForm, { side: "buy", holding: HOLDING, accounts: DEPOSITS, today: TODAY, minDate: "2026-01-05", ...done }));

    expect(fieldNames(markup)).toEqual(["amount", "date", "fromAccountId", "holdingId", "note", "shares"]);
    expect(selectedOption(markup, "fromAccountId")).toBe("台銀");
    expect(textOf(markup)).toContain("目前 1,000 股 · 10/14 收盤 $106.50");
    expect(formActions()).toEqual([actions.buyHoldingAction]);
  });

  it("賣出：入帳到存款帳戶（沒有定期定額時預設第一個），送到 sellHoldingAction", () => {
    const markup = render(createElement(BuySellForm, { side: "sell", holding: { ...HOLDING, settlementAccountId: null }, accounts: DEPOSITS, today: TODAY, minDate: "2026-01-05", ...done }));

    expect(fieldNames(markup)).toEqual(["amount", "date", "holdingId", "note", "shares", "toAccountId"]);
    expect(selectedOption(markup, "toAccountId")).toBe("台銀");
    expect(formActions()).toEqual([actions.sellHoldingAction]);
  });
});

describe("持股清單", () => {
  const holdings = (list: HoldingView[] = [HOLDING]) => render(createElement(Holdings, { holdings: list, accounts: DEPOSITS, today: TODAY, minDate: "2026-01-05", onDeleted: vi.fn() }));

  it("每檔寫股數、均價（95,000 元買 1,000 股是 $95.00）、收盤價、市值與損益（只寫正負號）", () => {
    expect(textOf(holdings())).toContain("006208 富邦台501,000 股 · 均價 $95.00 · 收盤 $106.50市值 $106,500損益 +$11,500\u00a0(+12.1%)");
  });

  it("讀不到股價：寫「股價暫時讀不到」，市值先用成本，不寫損益", () => {
    const text = textOf(holdings([{ ...HOLDING, priced: false, closeCents: null, quoteDate: null, value: 95000, profit: 0, profitPercent: 0 }]));

    expect(text).toContain("均價 $95.00 · 股價暫時讀不到市值 $95,000");
    expect(text).not.toMatch(/損益 [+-]?\$/);
  });

  it("買進、賣出、修改的視窗放在 ⋮ 選單外面（選單收起時視窗不會跟著卸載）；這三個項目標成會打開視窗，點了選單就收起、焦點回到 ⋮", () => {
    const markup = holdings();
    const menu = markup.match(/<div data-menu="">(.*?)<\/div>/)![1];
    const opensDialog = [...menu.matchAll(/<button[^>]*aria-haspopup="dialog"[^>]*>(.*?)<\/button>/g)].map((m) => textOf(m[1]));

    expect(formActions()).toEqual([actions.buyHoldingAction, actions.sellHoldingAction, actions.updateHoldingAction]);
    expect(markup).toContain('name="shares"');
    expect(menu).not.toContain('name="shares"');
    expect(opensDialog).toEqual(["買進", "賣出", "修改股數與成本"]);
  });

  it("刪除先確認，提醒這一檔的定期定額會一起刪除（買賣紀錄留著）", () => {
    holdings();
    const remove = vi.mocked(ActionButton).mock.calls.map(([props]) => props).find((props) => props.action !== undefined && props.fields.id === 9)!;

    expect(remove.confirmMessage).toContain("定期定額會一起刪除");
    expect(remove.confirmMessage).toContain("買賣紀錄會留著");
  });
});

describe("帳戶詳情", () => {
  const detail = (account: DepositDetail | InvestmentDetail | CreditDetail) => render(createElement(AccountDetailBody, { account, context }));
  const CARD: CreditDetail = {
    kind: "credit",
    id: 6,
    name: "國泰卡",
    recordsHref: "/savings/records?account=6",
    balance: -18480,
    owedNow: 18480,
    remainingDue: 12480,
    statementAmount: 12480,
    dueDate: "2026-10-20",
    status: "upcoming",
    daysLeft: 5,
    statementDay: 5,
    dueDay: 20,
    autopay: false,
    payFrom: { name: "生活費帳戶", remaining: 70520, short: false },
    needsBill: false,
    pay: { cardId: 6, cardName: "國泰卡", amount: 12480, payFromAccountId: 2, minDate: "2026-01-05" },
    bill: { cardId: 6, cardName: "國泰卡", estimate: 12480, statementDate: "2026-10-05", dueDate: "2026-10-20", payFromAccountId: 2, minDate: "2026-01-05" },
    history: [],
  };
  const DEPOSIT: DepositDetail = { kind: "deposit", id: 3, name: "緊急預備金 A", recordsHref: "/savings/records?account=3", balance: 8200, purposeName: null, monthlyPlan: null, target: { amount: 10000, percent: 82, reached: false } };
  const INVESTMENT: InvestmentDetail = {
    kind: "investment",
    id: 4,
    name: "臺銀證券",
    recordsHref: "/savings/records?account=4",
    ledgerBalance: 50000,
    value: 50000,
    cost: 45000,
    profit: 5000,
    profitPercent: 11.1,
    priced: true,
    quoteDate: null,
    holdings: [],
  };

  it("信用卡：大字是本期應繳；目前未繳跟它不一樣時才另外寫；扣款帳戶扣款後剩多少", () => {
    const text = textOf(detail(CARD));

    expect(text).toContain("本期應繳$12,48010/20 截止 · 還有 5 天");
    expect(text).toContain("目前未繳$18,480");
    expect(text).toContain("扣款帳戶生活費帳戶扣款後剩$70,520");
    expect(textOf(detail({ ...CARD, owedNow: 12480 }))).not.toContain("目前未繳");
  });

  it("信用卡的扣款帳戶不夠扣：寫出還差多少", () => {
    expect(textOf(detail({ ...CARD, payFrom: { name: "生活費帳戶", remaining: -2300, short: true } }))).toContain("不夠扣，還差 $2,300");
  });

  it("存款有目標：餘額已經是大字，目標那一列只寫目標金額加一條細長條（一個數字只講一次）", () => {
    const markup = detail(DEPOSIT);

    expect(textOf(markup).match(/\$8,200/g)).toHaveLength(1);
    expect(textOf(markup)).toContain("目標$10,000");
    expect(markup).toContain('style="width:82%"');
  });

  it("記一筆與更新餘額拿到這個帳戶：存款兩個都有，更新餘額用目前的餘額", () => {
    const markup = detail(DEPOSIT);

    expect(entryPoint(markup, "quick-add")).toContain('data-account="3"');
    expect(entryPoint(markup, "update-balance")).toMatch(/data-account="3" data-kind="deposit" data-balance="8200"/);
  });

  it("信用卡照帳單繳，不能更新餘額；記一筆預設這張卡", () => {
    const markup = detail(CARD);

    expect(entryPoint(markup, "quick-add")).toContain('data-account="6"');
    expect(entryPoint(markup, "update-balance")).toBeUndefined();
  });

  it("投資沒有持股：更新市值用帳上的餘額；有持股時市值照股價算，不能更新市值；投資帳戶不在詳情裡記一筆", () => {
    expect(entryPoint(detail(INVESTMENT), "update-balance")).toMatch(/data-account="4" data-kind="investment" data-balance="50000"/);
    expect(entryPoint(detail({ ...INVESTMENT, holdings: [HOLDING], value: 106500 }), "update-balance")).toBeUndefined();
    expect(entryPoint(detail(INVESTMENT), "quick-add")).toBeUndefined();
  });

  it("信用卡的最近幾期：結帳日、截止日、帳單、已繳、最後繳款的日子與狀態（已繳清、未繳、逾期）", () => {
    const markup = detail({
      ...CARD,
      history: [
        { id: 9, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12480, paid: 0, lastPaidOn: null, status: "unpaid" },
        { id: 8, statementDate: "2026-09-05", dueDate: "2026-09-21", amount: 7000, paid: 2000, lastPaidOn: "2026-09-10", status: "overdue" },
        { id: 7, statementDate: "2026-08-05", dueDate: "2026-08-20", amount: 5000, paid: 5000, lastPaidOn: "2026-08-18", status: "paid" },
      ],
    });
    const rows = [...markup.slice(markup.indexOf("最近 3 期")).matchAll(/<li class="grid[^"]*">(.*?)<\/li>/g)].map((m) => textOf(m[1]));

    expect(rows).toEqual([
      "10/5 結帳 · 10/20 截止帳單 $12,480已繳 $0—未繳",
      "9/5 結帳 · 9/21 截止帳單 $7,000已繳 $2,000 · 9/10 繳逾期",
      "8/5 結帳 · 8/20 截止帳單 $5,000已繳 $5,000 · 8/18 繳已繳清",
    ]);
  });

  it("信用卡有截止日才有「填本期帳單」，跟「已繳」一起放在按鈕列", () => {
    const labels = (markup: string) => [...markup.matchAll(/<button[^>]*aria-haspopup="dialog"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);

    expect(labels(detail(CARD))).toEqual(["填本期帳單", "已繳"]);
    expect(labels(detail({ ...CARD, bill: null }))).toEqual(["已繳"]);
  });

  it("刪掉最後一檔持股後清單整個不見：成功訊息與焦點留在詳情裡，不跟著清單消失", () => {
    const report = vi.fn();
    vi.mocked(rowControls.useRemovalNotice).mockReturnValue({ messageProps: { message: "已刪除「006208 富邦台50」", ref: { current: null } }, report });

    const withHolding = detail({ ...INVESTMENT, holdings: [HOLDING] });
    const deleteItem = vi.mocked(rowControls.DeleteMenuItem).mock.calls.at(-1)![0];

    expect(deleteItem.onDeleted).toBe(report);
    expect(textOf(withHolding)).toContain("已刪除「006208 富邦台50」");
    expect(textOf(detail(INVESTMENT))).toContain("已刪除「006208 富邦台50」");
  });
});

describe("填帳單", () => {
  const DRAFT = { cardId: 6, cardName: "國泰卡", estimate: 12480, statementDate: "2026-10-05", dueDate: "2026-10-20", payFromAccountId: 2, minDate: "2026-01-05" };
  const CATEGORIES = [
    { id: 11, name: "餐飲", kind: "expense" as const },
    { id: 21, name: "薪水", kind: "income" as const },
  ];
  const bill = (draft = DRAFT) => render(createElement(BillForm, { draft, categories: CATEGORIES, accounts: DEPOSITS, today: TODAY, ...done }));
  const optionsOf = (markup: string, name: string) => [...(markup.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`))?.[1] ?? "").matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
  const describedHint = (markup: string, name: string) => {
    const describedBy = inputOf(markup, name).match(/aria-describedby="([^"]+)"/)?.[1];
    return describedBy ? textOf(markup.match(new RegExp(`<p id="${describedBy}"[^>]*>([\\s\\S]*?)</p>`))?.[1] ?? "") : "";
  };

  it("帳單金額照銀行 App 填：先填紀錄算的這一期未繳；差額會記成「未記錄的刷卡」的說明接在欄位上；差額的分類選填、只列支出", () => {
    const markup = bill();

    expect(valueOf(markup, "amount")).toBe("12480");
    expect(valueOf(markup, "cardId")).toBe("6");
    expect(describedHint(markup, "amount")).toContain("未記錄的刷卡");
    expect(optionsOf(markup, "categoryId")).toEqual(["未分類", "餐飲"]);
    expect(inputOf(markup, "payToo")).toContain('type="checkbox"');
  });

  it("紀錄算出來是 0（例如這一期都沒記到刷卡）_帳單金額留空自己填，不先寫 0", () => {
    expect(valueOf(bill({ ...DRAFT, estimate: 0 }), "amount")).toBe("");
  });

  it("沒勾同時記下繳款送到 enterCardBillAction；勾了（帳單金額改叫 billAmount）送到 payCardAction，帳單與繳款一起記", async () => {
    bill();
    const submit = vi.mocked(dialog.useDialogForm).mock.calls.at(-1)![0];
    const only = new FormData();
    only.set("amount", "12480");
    const both = new FormData();
    both.set("billAmount", "12480");
    both.set("amount", "12480");

    await submit({}, only);
    await submit({}, both);

    expect(actions.enterCardBillAction).toHaveBeenCalledWith({}, only);
    expect(actions.payCardAction).toHaveBeenCalledWith({}, both);
  });
});
