import { Fragment, createElement, useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markup as render, textOf } from "@/dev/test-helpers";
import type { SalaryPrefill } from "../../dashboard-view";

// 視窗關著時不算繪內容 換掉 Dialog 才看得到裡面 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
// 入帳並分配要從打錯一行或分太多的狀態開始 只換掉那個 reducer 的初始狀態
vi.mock("react", { spy: true });
vi.mock("../../actions", () => ({ allocateSalaryAction: vi.fn() }));

const dialog = await import("@/core/ui/dialog");
const actions = await import("../../actions");
const { lastSalaryAccountPref } = await import("../../last-used");
const { salaryFormReducer } = await import("../../form-math");
const { ROW_MESSAGE_CLASS } = await import("./fields");
const { SalaryForm, SalaryMenu } = await import("./salary-dialog");
const { useReducer: realUseReducer } = await vi.importActual<typeof import("react")>("react");

const TODAY = "2026-10-14";
const CATEGORIES = [
  { id: 11, name: "餐飲", kind: "expense" as const },
  { id: 21, name: "薪水", kind: "income" as const },
  { id: 22, name: "獎金", kind: "income" as const },
];
const ACCOUNTS = [
  { id: 1, name: "國泰", kind: "deposit" as const, balance: 20000, monthlyPlan: null, targetAmount: null, sortOrder: 1 },
  { id: 2, name: "郵局", kind: "deposit" as const, balance: 95000, monthlyPlan: 10000, targetAmount: 100000, sortOrder: 2 },
  { id: 4, name: "元大證券", kind: "investment" as const, balance: 0, monthlyPlan: 3000, targetAmount: null, sortOrder: 3 },
  { id: 5, name: "急用金", kind: "deposit" as const, balance: 60000, monthlyPlan: 2000, targetAmount: 50000, sortOrder: 4 },
  { id: 3, name: "國泰信用卡", kind: "credit" as const, balance: -3500, monthlyPlan: null, targetAmount: null, sortOrder: 5 },
];
const PREFILL: SalaryPrefill = { ruleId: 7, period: "2026-10", amount: 52000, accountId: 2, categoryId: 21, date: "2026-10-09" };

const inputOf = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
const inputsOf = (markup: string, name: string) => [...markup.matchAll(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "g"))].map((m) => m[0]);
const selectOf = (markup: string, name: string) => markup.match(new RegExp(`<select[^>]*name="${name}"[^>]*>[\\s\\S]*?</select>`))?.[0] ?? "";
const selectedOption = (select: string) => select.match(/<option[^>]*selected=""[^>]*>([^<]*)<\/option>/)?.[1];
const describedHint = (markup: string, name: string) => {
  const describedBy = inputOf(markup, name).match(/aria-describedby="([^"]+)"/)?.[1];
  return describedBy ? textOf(markup.match(new RegExp(`<p id="${describedBy}"[^>]*>([\\s\\S]*?)</p>`))?.[1] ?? "") : "";
};
const done = { onDone: vi.fn(), onCancel: vi.fn() };
const menu = () => render(createElement(SalaryMenu, { accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY }));
const form = (prefill?: SalaryPrefill) => render(createElement(SalaryForm, { accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY, prefill, ...done }));

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(dialog.DialogMessage).mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
  vi.mocked(useReducer).mockImplementation(realUseReducer as never);
  lastSalaryAccountPref.save(0);
});

describe("頁首 ⋮ 裡的薪水入帳並分配", () => {
  it("只有信用卡（薪水沒有地方入帳）_⋮ 選單不出現", () => {
    expect(render(createElement(SalaryMenu, { accounts: [ACCOUNTS[4]], categories: CATEGORIES, today: TODAY }))).toBe("");
  });

  it("入帳帳戶只列存款與投資，預設是上次用的；分類預設「薪水」；送到 allocateSalaryAction", () => {
    lastSalaryAccountPref.save(4);
    const markup = menu();

    expect(selectOf(markup, "accountId")).not.toContain("國泰信用卡");
    expect(selectedOption(selectOf(markup, "accountId"))).toBe("元大證券");
    expect(selectedOption(selectOf(markup, "categoryId"))).toBe("薪水");
    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.allocateSalaryAction]);
  });

  it("成功訊息獨佔頁首那排按鈕的最後一整列", () => {
    menu();

    expect(vi.mocked(dialog.DialogMessage).mock.calls.map(([props]) => props.className)).toEqual([ROW_MESSAGE_CLASS]);
  });
});

describe("入帳並分配的表單", () => {
  it("每個有每月規劃的帳戶一行（帳戶 id 與金額成對送出），金額照建議、可以改；有目標的最多分到目標為止", () => {
    const markup = form();

    expect(inputsOf(markup, "transferAccountId").map((input) => input.match(/value="(\d+)"/)?.[1])).toEqual(["2", "4", "5"]);
    // 郵局離目標只差 5,000 比每月規劃 10,000 少 急用金已經超過目標
    expect(inputsOf(markup, "transferAmount").map((input) => input.match(/value="(\d+)"/)?.[1])).toEqual(["5000", "3000", "0"]);
    expect(textOf(markup)).toContain("離目標只差 $5,000（每月規劃 $10,000）");
    expect(textOf(markup)).toContain("已達目標 $50,000，這次不用再轉");
  });

  /** 從中間的狀態開始算繪 入帳帳戶是國泰 */
  const formWith = (state: { salaryText: string; edits: Record<number, string> }, accounts = ACCOUNTS) => {
    vi.mocked(useReducer).mockImplementation(((reducer: unknown, ...rest: unknown[]) =>
      reducer === salaryFormReducer ? [{ receivingId: 1, ...state }, vi.fn()] : (realUseReducer as (...args: unknown[]) => unknown)(reducer, ...rest)) as never);
    return render(createElement(SalaryForm, { accounts, categories: CATEGORIES, today: TODAY, ...done }));
  };
  const submit = (markup: string) => markup.match(/<button(?:(?!<\/button>)[\s\S])*入帳並分配<\/button>/)?.[0] ?? "";

  it("某一行打錯（例如 1.5、-500）：那一行標成錯誤、寫出原因（報讀器在欄位上會念），送出鈕停用；不再當成 0 悄悄送出", () => {
    const markup = formWith({ salaryText: "43000", edits: { 4: "1.5" } });
    const line = inputsOf(markup, "transferAmount").find((input) => input.includes('value="1.5"')) ?? "";

    expect(line).toContain('aria-invalid="true"');
    expect(describedHint(markup.replace(line, line.replace('name="transferAmount"', 'name="bad"')), "bad")).toContain("只能是整數");
    expect(inputsOf(markup, "transferAmount").filter((input) => input.includes("aria-invalid"))).toHaveLength(1);
    expect(submit(markup)).toMatch(/^<button disabled=""/);
  });

  it("分出去的比薪水多：寫出多了多少，送出鈕停用", () => {
    const markup = formWith({ salaryText: "6000", edits: {} });

    expect(textOf(markup)).toContain("分出去的比薪水多：$2,000");
    expect(submit(markup)).toMatch(/^<button disabled=""/);
  });

  it("日期不能早於入帳帳戶與要轉進去的帳戶開始記帳的那天", () => {
    const markup = formWith({ salaryText: "43000", edits: {} }, ACCOUNTS.map((account) => ({ ...account, startDate: account.id === 4 ? "2026-10-10" : "2026-09-01" })));

    expect(inputOf(markup, "date")).toContain('min="2026-10-10"');
  });

  it("都沒問題：寫出留在入帳帳戶的錢，可以送出", () => {
    const markup = formWith({ salaryText: "43,000", edits: { 2: "" } });

    expect(textOf(markup)).toContain("留在「國泰」：$40,000");
    expect(submit(markup)).not.toContain("disabled");
    expect(markup).not.toContain("aria-invalid");
  });
});

describe("待處理的薪水（入帳並分配）", () => {
  it("先填好固定收支的入帳帳戶、預計金額（可以改）、分類與那一期的日期；送出時帶規則與那一期", () => {
    const markup = form(PREFILL);

    expect(inputOf(markup, "ruleId")).toContain('value="7"');
    expect(inputOf(markup, "period")).toContain('value="2026-10"');
    expect(inputOf(markup, "amount")).toContain('value="52000"');
    expect(selectedOption(selectOf(markup, "accountId"))).toBe("郵局");
    expect(selectedOption(selectOf(markup, "categoryId"))).toBe("薪水");
    expect(inputOf(markup, "date")).toContain('value="2026-10-09"');
  });

  it("發薪日還沒到就先入帳：日期先寫今天，不能記未來", () => {
    expect(inputOf(form({ ...PREFILL, date: "2026-10-20" }), "date")).toContain(`value="${TODAY}"`);
  });

  it("規則沒有分類：分類選未分類，不改用預設的薪水", () => {
    expect(selectedOption(selectOf(form({ ...PREFILL, categoryId: null }), "categoryId"))).toBe("未分類");
  });

  it("不是從待處理打開的：不帶規則與期別", () => {
    const markup = form();

    expect(inputOf(markup, "ruleId")).toBe("");
    expect(inputOf(markup, "period")).toBe("");
  });
});
