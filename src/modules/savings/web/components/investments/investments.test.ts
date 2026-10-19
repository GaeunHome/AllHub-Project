import { Fragment, createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { menuOf, outsideMenus } from "@/dev/more-menu-stub";
import { markup as render, textOf } from "@/dev/test-helpers";
import type { HoldingView } from "../../dashboard-view";
import type { BrokerageView, InvestmentSummary } from "../../investments-view";

// 視窗與選單關著時不算繪內容 換掉才看得到裡面 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/action-button", { spy: true });
vi.mock("@/core/ui/more-menu", () => import("@/dev/more-menu-stub"));
vi.mock("../../actions", () =>
  Object.fromEntries(
    [
      "createHoldingAction",
      "updateHoldingAction",
      "deleteHoldingAction",
      "buyHoldingAction",
      "sellHoldingAction",
      "createAccountAction",
      "updateAccountAction",
      "setAccountActiveAction",
      "moveAccountAction",
      "deleteAccountAction",
      "updateBalanceAction",
    ].map((name) => [name, vi.fn()]),
  ),
);
// 只看新增證券帳戶的按鈕收到什麼
vi.mock("../accounts/add-account-button", () => ({ AddAccountButton: vi.fn(() => createElement("button", { "data-add": "investment" }, "新增證券帳戶")) }));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const { AddAccountButton } = await import("../accounts/add-account-button");
const { Holdings } = await import("./holdings");
const { AddHoldingForm, EditHoldingForm, BuySellForm } = await import("./holding-forms");
const { BrokerageCard } = await import("./brokerage-card");
const { BrokerageList } = await import("./brokerage-list");
const { SummaryCard } = await import("./summary-card");

const TODAY = "2026-10-15";
const inputOf = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
const valueOf = (markup: string, name: string) => inputOf(markup, name).match(/value="([^"]*)"/)?.[1];
const selectedOption = (markup: string, name: string) =>
  markup.match(new RegExp(`<select[^>]*name="${name}"[^>]*>[\\s\\S]*?</select>`))?.[0].match(/<option[^>]*selected=""[^>]*>([^<]*)<\/option>/)?.[1];
const fieldNames = (markup: string) => [...new Set([...markup.matchAll(/<(?:input|select)[^>]*name="([^"]+)"/g)].map((m) => m[1]))].sort();
const formActions = () => vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action);
const buttonsOf = (markup: string) => [...markup.matchAll(/<button[^>]*>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].map((m) => textOf(m[1]).trim());

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

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(AddAccountButton).mockClear();
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
  const MENU = "「006208 富邦台50」的選項";

  it("每檔寫代號、名稱、股數、均價（95,000 元買 1,000 股是 $95.00）、收盤價、市值與損益（只寫正負號，括號是半形）", () => {
    expect(textOf(holdings())).toContain("006208富邦台501,000 股 · 均價 $95.00 · 收盤 $106.50市值 $106,500損益 +$11,500 (+12.1%)");
  });

  it("讀不到股價：寫「股價暫時讀不到」，市值先用成本，不寫損益", () => {
    const text = textOf(holdings([{ ...HOLDING, priced: false, closeCents: null, quoteDate: null, value: 95000, profit: 0, profitPercent: 0 }]));

    expect(text).toContain("均價 $95.00 · 股價暫時讀不到市值 $95,000");
    expect(text).not.toMatch(/損益 [+-]?\$/);
  });

  it("買進、賣出直接在每一列上，不用打開 ⋮；⋮ 只有修改股數與成本與刪除", () => {
    const markup = holdings();

    expect(buttonsOf(outsideMenus(markup))).toEqual(expect.arrayContaining(["買進", "賣出"]));
    expect(buttonsOf(menuOf(markup, MENU))).toEqual(["修改股數與成本", "刪除"]);
    expect(formActions()).toEqual([actions.buyHoldingAction, actions.sellHoldingAction, actions.updateHoldingAction]);
  });

  it("視窗都放在 ⋮ 選單外面（選單收起時不會跟著卸載），打開視窗的按鈕都標成會打開視窗", () => {
    const markup = holdings();
    const menu = menuOf(markup, MENU);

    expect(markup).toContain('name="shares"');
    expect(menu).not.toContain('name="shares"');
    expect([...menu.matchAll(/<button[^>]*aria-haspopup="dialog"[^>]*>(.*?)<\/button>/g)].map((m) => textOf(m[1]))).toEqual(["修改股數與成本"]);
  });

  it("賣光了（0 股）_不能再賣出，買進還在", () => {
    const buttons = buttonsOf(outsideMenus(holdings([{ ...HOLDING, shares: 0 }])));

    expect(buttons).toContain("買進");
    expect(buttons).not.toContain("賣出");
  });

  it("刪除先確認，提醒這一檔的定期定額會一起刪除（買賣紀錄留著）", () => {
    holdings();
    const remove = vi
      .mocked(ActionButton)
      .mock.calls.map(([props]) => props)
      .find((props) => props.fields.id === 9);

    expect(remove?.confirmMessage).toContain("定期定額會一起刪除");
    expect(remove?.confirmMessage).toContain("買賣紀錄會留著");
  });
});

const BROKERAGE: BrokerageView = {
  id: 6,
  name: "臺銀證券",
  kind: "investment",
  recordsHref: "/savings/records?account=6",
  ledgerBalance: 95000,
  value: 106500,
  cost: 95000,
  profit: 11500,
  profitPercent: 12.1,
  priced: true,
  quoteDate: "2026-10-14",
  holdings: [HOLDING],
  label: "長期投資",
  startDate: "2026-01-05",
  usage: { recurringCount: 1, hasRecords: true, hasTransfers: true, holdingCount: 1 },
  draft: {
    id: 6,
    name: "臺銀證券",
    kind: "investment",
    label: "長期投資",
    openingBalance: 0,
    openingCost: null,
    monthlyPlan: null,
    targetAmount: null,
    statementDay: null,
    payFromAccountId: null,
    autopay: false,
  },
  isFirst: true,
  isLast: true,
};
const NO_HOLDINGS: BrokerageView = {
  ...BROKERAGE,
  id: 8,
  name: "元大證券",
  label: null,
  holdings: [],
  value: 20000,
  cost: 18000,
  profit: 2000,
  profitPercent: 11.1,
  quoteDate: null,
  ledgerBalance: 20000,
  usage: { recurringCount: 0, hasRecords: false, hasTransfers: false, holdingCount: 0 },
};

describe("證券帳戶", () => {
  const card = (brokerage: BrokerageView) => render(createElement(BrokerageCard, { brokerage, depositAccounts: DEPOSITS, payFromAccounts: [], today: TODAY, onRemoved: vi.fn() }));

  it("名稱、用途文字、合計市值；讀不到股價時說明（市值先用成本算）", () => {
    const text = textOf(card(BROKERAGE));

    expect(text).toContain("臺銀證券");
    expect(text).toContain("長期投資");
    expect(text).toContain("$106,500");
    expect(textOf(card({ ...BROKERAGE, priced: false, value: 95000 }))).toMatch(/\$95,000股價暫時讀不到/);
  });

  it("有持股時市值照股價算，不能更新市值；沒有持股時可以更新市值，也可以新增持股", () => {
    expect(buttonsOf(card(BROKERAGE))).not.toContain("更新市值");
    expect(buttonsOf(card(NO_HOLDINGS))).toEqual(expect.arrayContaining(["更新市值", "新增持股"]));
  });

  it("⋮：修改帳戶、停用、刪除；刪除的確認寫出持股與定期定額會一起刪", () => {
    const markup = card(BROKERAGE);

    expect(buttonsOf(menuOf(markup, "「臺銀證券」的選項"))).toEqual(["修改帳戶", "停用", "刪除帳戶"]);
    expect(vi.mocked(ActionButton).mock.calls.map(([props]) => props.confirmMessage)).toContainEqual(expect.stringContaining("1 檔持股、1 筆固定收支都會一起刪除"));
  });
});

describe("證券帳戶清單", () => {
  const view = { summary: { value: 0, cost: 0, profit: 0, profitPercent: null, priced: true, quoteDate: null, accounts: 0 }, brokerages: [], pausedCount: 0 };
  const list = (props: Record<string, unknown> = {}) => render(createElement(BrokerageList, { view, depositAccounts: DEPOSITS, payFromAccounts: [], today: TODAY, openAdd: false, ...props }));

  it("還沒有證券帳戶_放「新增證券帳戶」", () => {
    const markup = list();

    expect(markup).toContain('data-add="investment"');
    expect(vi.mocked(AddAccountButton).mock.calls[0][0]).toMatchObject({ kind: "investment" });
  });

  it("網址帶 add=investment（從總覽的開始設定連過來）_新增證券帳戶的視窗打開一次", () => {
    list({ openAdd: true });

    expect(vi.mocked(AddAccountButton).mock.calls[0][0]).toMatchObject({ kind: "investment", openFromLink: true });
  });

  it("有停用的證券帳戶_說明在帳戶頁的已停用裡", () => {
    const markup = list({ view: { ...view, pausedCount: 1 } });

    expect(markup).toMatch(/<a [^>]*href="\/savings\/accounts"/);
  });
});

describe("投資的摘要", () => {
  const SUMMARY: InvestmentSummary = { value: 64847, cost: 57000, profit: 7847, profitPercent: 13.8, priced: true, quoteDate: "2026-10-15", accounts: 2 };

  it("總市值是大字；下面一行寫成本、損益（±$ 與 ±%，半形括號）與收盤日", () => {
    const text = textOf(render(createElement(SummaryCard, { summary: SUMMARY })));

    expect(text).toContain("$64,847");
    expect(text).toContain("成本 $57,000 · 損益 +$7,847 (+13.8%) · 10/15 收盤");
  });

  it("讀不到股價_寫「股價暫時讀不到」，不寫損益與收盤日", () => {
    const text = textOf(render(createElement(SummaryCard, { summary: { ...SUMMARY, priced: false } })));

    expect(text).toContain("股價暫時讀不到");
    expect(text).not.toContain("損益");
    expect(text).not.toContain("收盤");
  });
});
