import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillDraft } from "../../dashboard-view";

// 視窗關著時不算繪內容 換掉才看得到裡面 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("../../actions", () => Object.fromEntries(["payCardAction", "enterCardBillAction", "createAccountAction", "updateAccountAction"].map((name) => [name, vi.fn()])));
// 網址帶 add 參數時打開視窗並拿掉參數 這裡只看按鈕與表單
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/savings/accounts" }));

const dialog = await import("@/core/ui/dialog");
const actions = await import("../../actions");
const { BillForm, BillHistory } = await import("./card-bill");
const { AddAccountButton } = await import("./add-account-button");

const TODAY = "2026-10-15";
const render = (element: ReactNode) => renderToStaticMarkup(element as never);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const inputOf = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
const valueOf = (markup: string, name: string) => inputOf(markup, name).match(/value="([^"]*)"/)?.[1];
const formActions = () => vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action);

const DEPOSITS = [
  { id: 1, name: "台銀", kind: "deposit" as const },
  { id: 2, name: "生活費帳戶", kind: "deposit" as const },
];
const done = { onDone: vi.fn(), onCancel: vi.fn() };

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
});

describe("帳單紀錄（最近幾期）", () => {
  it("每期寫結帳日、截止日、帳單、已繳、繳款日與狀態（已繳清、未繳、逾期）", () => {
    const markup = render(
      createElement(BillHistory, {
        bills: [
          { id: 9, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12480, paid: 0, lastPaidOn: null, status: "unpaid" },
          { id: 8, statementDate: "2026-09-05", dueDate: "2026-09-21", amount: 7000, paid: 2000, lastPaidOn: "2026-09-10", status: "overdue" },
          { id: 7, statementDate: "2026-08-05", dueDate: "2026-08-20", amount: 5000, paid: 5000, lastPaidOn: "2026-08-18", status: "paid" },
        ],
      }),
    );
    const rows = [...markup.slice(markup.indexOf("最近 3 期")).matchAll(/<li class="grid[^"]*">(.*?)<\/li>/g)].map((m) => textOf(m[1]));

    expect(rows).toEqual([
      "10/5 結帳 · 10/20 截止帳單 $12,480已繳 $0—未繳",
      "9/5 結帳 · 9/21 截止帳單 $7,000已繳 $2,000 · 9/10 繳逾期",
      "8/5 結帳 · 8/20 截止帳單 $5,000已繳 $5,000 · 8/18 繳已繳清",
    ]);
  });
});

describe("填帳單", () => {
  const DRAFT: BillDraft = { cardId: 6, cardName: "國泰卡", estimate: 12480, statementDate: "2026-10-05", dueDate: "2026-10-20", payFromAccountId: 2, minDate: "2026-01-05" };
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

  it("繳款截止日照帳單填、一定要填：先填伺服器算好的預設，只能選結帳日（10/5）到結帳後 60 天（12/4）", () => {
    const dueDate = inputOf(bill(), "dueDate");

    expect(dueDate).toContain('type="date"');
    expect(dueDate).toContain("required");
    expect([valueOf(bill(), "dueDate"), dueDate.match(/min="([^"]*)"/)?.[1], dueDate.match(/max="([^"]*)"/)?.[1]]).toEqual(["2026-10-20", "2026-10-05", "2026-12-04"]);
  });

  it("沒有結帳日的卡：填的那天（今天 10/15）就是結帳日，截止日從今天選到 12/14", () => {
    const dueDate = inputOf(bill({ ...DRAFT, statementDate: null, dueDate: "2026-10-27" }), "dueDate");

    expect([dueDate.match(/value="([^"]*)"/)?.[1], dueDate.match(/min="([^"]*)"/)?.[1], dueDate.match(/max="([^"]*)"/)?.[1]]).toEqual(["2026-10-27", "2026-10-15", "2026-12-14"]);
  });

  it("截止日先填帳單上印的日子；那天遇假日時欄位下寫出順延到哪天（10/25 週日、10/26 補假 → 10/27），沒有順延就不寫", () => {
    const printed = bill({ ...DRAFT, dueDate: "2026-10-25", shiftedDueDate: "2026-10-27" });

    expect(valueOf(printed, "dueDate")).toBe("2026-10-25");
    expect(describedHint(printed, "dueDate")).toBe("遇假日順延到 10/27");
    // 沒帶順延後的日子時自己照辦公日曆算
    expect(describedHint(bill({ ...DRAFT, dueDate: "2026-10-25" }), "dueDate")).toBe("遇假日順延到 10/27");
    expect(describedHint(bill(), "dueDate")).toBe("");
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

describe("新增帳戶的按鈕", () => {
  it("按鈕寫出要新增哪一種，打開的表單固定是那一種（不用再選類型），送到 createAccountAction", () => {
    const markup = render(createElement(AddAccountButton, { kind: "credit", payFromAccounts: DEPOSITS.map((account) => ({ ...account, active: true })) }));

    expect(textOf(markup.match(/<button[^>]*aria-haspopup="dialog"[^>]*>.*?<\/button>/)![0])).toBe("新增信用卡");
    expect(inputOf(markup, "kind")).toMatch(/type="hidden"[^>]*value="credit"/);
    expect(markup).not.toContain('aria-label="帳戶類型"');
    expect(formActions()).toEqual([actions.createAccountAction]);
  });
});
