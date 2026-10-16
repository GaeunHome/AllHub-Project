import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmDraft, PendingEntry } from "../../dashboard-view";

// 視窗與選單關著時不算繪內容 換掉才看得到裡面 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/action-button", { spy: true });
vi.mock("@/core/ui/more-menu", () => ({ MoreMenu: ({ children }: { children: ReactNode }) => createElement("div", { "data-menu": "" }, children) }));
vi.mock("../../actions", () => ({ confirmOccurrenceAction: vi.fn(), skipOccurrenceAction: vi.fn(), payCardAction: vi.fn(), allocateSalaryAction: vi.fn(), enterCardBillAction: vi.fn() }));
const report = vi.fn();
vi.mock("../dashboard/overview-notice", () => ({ useOverviewNotice: () => report }));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const { PendingList } = await import("./pending-list");
const { ConfirmForm } = await import("./confirm-form");
const { PayCardForm } = await import("../accounts/pay-card-form");

const TODAY = "2026-10-15";
const render = (element: ReactNode) => renderToStaticMarkup(element as never);
const inputOf = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
const valueOf = (markup: string, name: string) => inputOf(markup, name).match(/value="([^"]*)"/)?.[1];
const selectedOption = (markup: string, name: string) => markup.match(new RegExp(`<select[^>]*name="${name}"[^>]*>[\\s\\S]*?</select>`))?.[0].match(/<option[^>]*selected=""[^>]*>([^<]*)<\/option>/)?.[1];

const DEPOSITS = [
  { id: 1, name: "台銀", kind: "deposit" as const },
  { id: 2, name: "生活費帳戶", kind: "deposit" as const },
];
const row = (name: string, action: "bill" | "pay" | "confirm" | "allocate") => ({ key: name, name, detail: "", badge: null, amountText: "$1", action });
const CONFIRM: ConfirmDraft = {
  ruleId: 3,
  period: "2026-10",
  name: "006208 定期定額",
  kind: "transfer",
  amount: 5000,
  date: TODAY,
  minDate: "2026-01-05",
  where: "台銀 → 臺銀證券",
  notePlaceholder: "留空會寫「買進 006208 N 股」",
  regularBuy: { symbol: "006208", name: "富邦台50", closeCents: 10650, quoteDate: "2026-10-14", estimate: { shares: 46, cost: 4900 } },
};
const ENTRIES: PendingEntry[] = [
  { row: row("國泰卡", "pay"), rule: null, pay: { cardId: 6, cardName: "國泰卡", amount: 12480, payFromAccountId: 2, minDate: "2026-01-05" } },
  { row: row("006208 定期定額", "confirm"), rule: { ruleId: 3, period: "2026-10" }, confirm: CONFIRM },
  { row: row("薪水", "allocate"), rule: { ruleId: 1, period: "2026-10" }, salary: { ruleId: 1, period: "2026-10", amount: 52000, accountId: 2, categoryId: null, date: "2026-10-20" } },
];
const list = (entries = ENTRIES) =>
  render(
    createElement(PendingList, {
      entries,
      payFromAccounts: DEPOSITS,
      salaryAccounts: DEPOSITS.map((account) => ({ ...account, balance: 0, monthlyPlan: null, targetAmount: null, sortOrder: account.id })),
      categories: [{ id: 11, name: "餐飲", kind: "expense" }],
      today: TODAY,
    }),
  );

beforeEach(() => {
  report.mockClear();
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
});

describe("待處理的清單", () => {
  it("已繳、確認、入帳並分配成功後那一列會不見：訊息交給外面的 OverviewNotice", () => {
    list();
    const forms = vi.mocked(dialog.useDialogForm).mock.calls;

    expect(forms.map(([action]) => action)).toEqual([actions.payCardAction, actions.confirmOccurrenceAction, actions.allocateSalaryAction]);
    forms.forEach(([, onDone], i) => onDone(`訊息 ${i}`, {}));
    expect(report.mock.calls).toEqual([["訊息 0"], ["訊息 1"], ["訊息 2"]]);
  });

  it("固定收支的 ⋮：略過這一期先確認，送出規則與那一期，成功後訊息也交給外面；信用卡沒有略過", async () => {
    const markup = list();
    const skips = vi.mocked(ActionButton).mock.calls.map(([props]) => props);
    vi.mocked(actions.skipOccurrenceAction).mockResolvedValue({ message: "已略過" });

    expect(skips.map((props) => props.fields)).toEqual([
      { ruleId: 3, period: "2026-10" },
      { ruleId: 1, period: "2026-10" },
    ]);
    expect(skips[0].confirmMessage).toContain("2026 年 10 月");
    await skips[0].action({}, new FormData());
    expect(report).toHaveBeenCalledWith("已略過");
    // 連到設定頁並打開那一條的修改視窗
    expect([...markup.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>).)*修改這個固定收支/g)].map((m) => m[1].replace(/&amp;/g, "&"))).toEqual(["/savings/settings?recurring=3#recurring", "/savings/settings?recurring=1#recurring"]);
  });
});

describe("還沒填帳單的卡", () => {
  it("按鈕是「填帳單」，打開的是填帳單的視窗（不是繳款）；成功後那一列會變，訊息也交給外面", async () => {
    const markup = list([{ row: row("國泰卡", "bill"), rule: null, bill: { cardId: 6, cardName: "國泰卡", estimate: 12480, statementDate: "2026-10-05", dueDate: "2026-10-20", payFromAccountId: 2, minDate: "2026-01-05" } }]);
    const [[submit, onDone]] = vi.mocked(dialog.useDialogForm).mock.calls;
    const filled = new FormData();
    filled.set("amount", "12480");

    expect(markup).toMatch(/aria-label="填帳單：國泰卡"/);
    await submit({}, filled);
    expect(actions.enterCardBillAction).toHaveBeenCalledWith({}, filled);
    onDone("已記下帳單", {});
    expect(report).toHaveBeenCalledWith("已記下帳單");
  });
});

describe("確認固定收支", () => {
  const confirm = (draft: ConfirmDraft) => render(createElement(ConfirmForm, { draft, today: TODAY, onDone: vi.fn(), onCancel: vi.fn() }));

  it("定期定額：股數與扣款先填好估算的值，送出規則、那一期、股數、金額、日期與備註", () => {
    const markup = confirm(CONFIRM);

    expect([valueOf(markup, "ruleId"), valueOf(markup, "period"), valueOf(markup, "shares"), valueOf(markup, "amount"), valueOf(markup, "date")]).toEqual(["3", "2026-10", "46", "4900", TODAY]);
    expect(inputOf(markup, "note")).toContain("placeholder=\"留空會寫「買進 006208 N 股」\"");
  });

  it("定期定額讀不到股價：股數與扣款留空，寫出要照券商 App 填", () => {
    const markup = confirm({ ...CONFIRM, regularBuy: { ...CONFIRM.regularBuy!, closeCents: null, quoteDate: null, estimate: null } });

    expect(valueOf(markup, "shares")).toBeUndefined();
    expect(valueOf(markup, "amount")).toBeUndefined();
    expect(markup).toContain("暫時讀不到股價");
  });

  it("一般的收支：金額先填預計的，可以改；沒有股數", () => {
    const markup = confirm({ ...CONFIRM, kind: "expense", amount: 1800, regularBuy: null });

    expect(valueOf(markup, "amount")).toBe("1800");
    expect(inputOf(markup, "shares")).toBe("");
  });
});

describe("繳卡費", () => {
  it("金額先填本期應繳，從這張卡的扣款帳戶繳；送出卡片、轉出帳戶、金額與日期", () => {
    const markup = render(createElement(PayCardForm, { draft: ENTRIES[0].pay!, accounts: DEPOSITS, today: TODAY, onDone: vi.fn(), onCancel: vi.fn() }));

    expect([valueOf(markup, "cardId"), valueOf(markup, "amount"), valueOf(markup, "date")]).toEqual(["6", "12480", TODAY]);
    expect(selectedOption(markup, "fromAccountId")).toBe("生活費帳戶");
    expect(vi.mocked(dialog.useDialogForm).mock.calls.at(-1)?.[0]).toBe(actions.payCardAction);
  });
});
