import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecurringItem } from "./recurring-card";

// 視窗與選單關著時不算繪內容 換成直接算繪才看得到表單與選單裡的按鈕
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/more-menu", () => ({ MoreMenu: ({ label, children }: { label: string; children: ReactNode }) => createElement("div", { "data-menu": label }, children) }));
// 刪除鈕 要看交給它的確認訊息
vi.mock("@/core/ui/action-button", { spy: true });
// effect 另外在 open-from-link.effect.test.ts 測
// 真的 hook 要有路由才能算繪 這裡換成只記下要不要打開
vi.mock("./open-from-link", () => ({ useOpenFromLink: vi.fn(), useLinkedTrigger: vi.fn((dialog: { triggerProps: unknown }) => dialog.triggerProps) }));
vi.mock("../../actions", () => ({
  createAccountAction: vi.fn(),
  updateAccountAction: vi.fn(),
  setAccountActiveAction: vi.fn(),
  moveAccountAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  createPurposeAction: vi.fn(),
  updatePurposeAction: vi.fn(),
  movePurposeAction: vi.fn(),
  deletePurposeAction: vi.fn(),
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
  moveCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
  createRecurringAction: vi.fn(),
  updateRecurringAction: vi.fn(),
  setRecurringActiveAction: vi.fn(),
  deleteRecurringAction: vi.fn(),
}));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const { useLinkedTrigger } = await import("./open-from-link");
const { AccountsCard } = await import("./accounts-card");
const { PurposesCard } = await import("./purposes-card");
const { CategoriesCard } = await import("./categories-card");
const { RecurringCard } = await import("./recurring-card");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const menuForms = (markup: string) => [...markup.matchAll(/<form[^>]*>((?:(?!<\/form>)[\s\S])*)<\/form>/g)].map((m) => m[1]).filter((form) => form.includes('class="menu-item'));
const menuOf = (markup: string, label: string) => markup.split(`data-menu="${label}"`)[1]?.split("data-menu=")[0] ?? "";
// 報讀器先念修改 只認整列的按鈕 不算新增
const rowButtons = (markup: string) => [...markup.matchAll(/<button[^>]*aria-haspopup="dialog"[^>]*>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].map((m) => textOf(m[1])).filter((text) => text.startsWith("修改："));
const groupTitles = (markup: string) => [...markup.matchAll(/<h3[^>]*>((?:(?!<\/h3>)[\s\S])*)<\/h3>/g)].map((m) => textOf(m[1]));
const rowsInGroup = (markup: string, title: string) => {
  const group = markup.split(/<h3[^>]*>/).find((part) => textOf(part.split("</h3>")[0]).startsWith(title)) ?? "";
  return rowButtons(group);
};
const moves = (markup: string, label: string) =>
  menuForms(menuOf(markup, label))
    .filter((form) => form.includes('name="direction"'))
    .map((form) => textOf(form));
const deleteConfirms = () => vi.mocked(ActionButton).mock.calls.filter(([props]) => String(props.className).includes("menu-item-danger")).map(([props]) => props.confirmMessage);
const chips = (markup: string) => [...markup.matchAll(/<span class="chip[^"]*">([^<]*)<\/span>/g)].map((m) => m[1]);

/** 哪些視窗要從連結自己打開 回傳打開後要回到的網址 */
const linkedOpens = () => vi.mocked(useLinkedTrigger).mock.calls.filter(([, enabled]) => enabled).map(([, , href]) => href);

beforeEach(() => {
  vi.mocked(useLinkedTrigger).mockClear();
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
});

describe("帳戶", () => {
  const base = {
    purposeId: null,
    openingBalance: 0,
    openingCost: null,
    monthlyPlan: null,
    targetAmount: null,
    dueDay: null,
    statementDay: null,
    payFromAccountId: null,
    autopay: false,
    active: true,
    purposeName: null,
    payFromName: null,
    recurringCount: 0,
    hasRecords: true,
    hasTransfers: false,
  };
  // 設定的順序裡類型交錯 畫面照類型分組
  const ACCOUNTS = [
    { ...base, id: 3, name: "國泰卡", kind: "credit" as const, openingBalance: -3500, statementDay: 5, dueDay: 20, payFromAccountId: 1, payFromName: "生活費帳戶", autopay: true },
    { ...base, id: 1, name: "生活費帳戶", kind: "deposit" as const, purposeId: 5, purposeName: "生活費", monthlyPlan: 5000, targetAmount: 100000, recurringCount: 2, hasTransfers: true },
    { ...base, id: 4, name: "臺銀證券", kind: "investment" as const },
    { ...base, id: 2, name: "台銀", kind: "deposit" as const },
    { ...base, id: 8, name: "舊帳戶", kind: "deposit" as const, active: false, hasRecords: false },
  ];
  const card = () => renderToStaticMarkup(createElement(AccountsCard, { accounts: ACCOUNTS, purposes: [{ id: 5, name: "生活費" }] }));

  it("照類型分組：存款、投資、信用卡，組裡照設定的順序", () => {
    const markup = card();

    expect(groupTitles(markup)).toEqual(["存款", "投資", "信用卡"]);
    const deposits = rowsInGroup(markup, "存款");
    expect(deposits).toHaveLength(3);
    expect(deposits[0]).toMatch(/^修改：生活費帳戶/);
    expect(deposits[1]).toMatch(/^修改：台銀/);
    expect(deposits[2]).toMatch(/^修改：舊帳戶/);
    expect(rowsInGroup(markup, "投資")).toEqual(["修改：臺銀證券"]);
    expect(rowsInGroup(markup, "信用卡")).toHaveLength(1);
  });

  it("每一列的說明：用途是一般文字、每月規劃與目標；信用卡寫結帳日、截止日、扣款帳戶與自動扣繳；標籤只給「已停用」", () => {
    const markup = card();
    const text = textOf(markup);

    expect(text).toContain("生活費 · 每月規劃 $5,000 · 目標 $100,000");
    expect(text).toContain("每月 5 日結帳 · 20 日截止 · 從「生活費帳戶」扣款 · 自動扣繳");
    expect(chips(markup)).toEqual(["已停用"]);
  });

  it("點一列就是修改：整列是打開視窗的按鈕；新增送到 createAccountAction，每一列送到 updateAccountAction", () => {
    const markup = card();

    expect(rowButtons(markup)).toHaveLength(5);
    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.createAccountAction, ...Array(5).fill(actions.updateAccountAction)]);
  });

  it("⋮ 選單的上移、下移只在同一類裡：每組第一個不能上移、最後一個不能下移", () => {
    const markup = card();

    expect(moves(markup, "「生活費帳戶」的選項")).toEqual(["下移"]);
    expect(moves(markup, "「台銀」的選項")).toEqual(["上移", "下移"]);
    expect(moves(markup, "「舊帳戶」的選項")).toEqual(["上移"]);
    // 一類只有一個 不能移
    expect(moves(markup, "「國泰卡」的選項")).toEqual([]);
  });

  it("⋮ 選單：停用的帳戶是「恢復」，其他是「停用」；送出的值是相反的狀態", () => {
    const forms = menuForms(menuOf(card(), "「舊帳戶」的選項")).filter((form) => form.includes('name="active"'));

    expect(forms.map((form) => [form.match(/name="active" value="(\w+)"/)?.[1], textOf(form)])).toEqual([["true", "恢復"]]);
    expect(menuForms(menuOf(card(), "「台銀」的選項")).find((form) => form.includes('name="active"'))).toContain('value="false"');
  });

  it("⋮ 選單的刪除先確認：紀錄、固定收支會一起刪；有轉帳的說其他帳戶的餘額會變；還沒有紀錄的直接說", () => {
    card();

    const confirms = deleteConfirms();
    expect(confirms.find((message) => message?.includes("「生活費帳戶」"))).toContain("這個帳戶的所有紀錄和 2 筆固定收支都會一起刪除，無法復原。");
    expect(confirms.find((message) => message?.includes("「生活費帳戶」"))).toContain("那些帳戶的餘額會跟著改變");
    expect(confirms.find((message) => message?.includes("「國泰卡」"))).not.toContain("其他帳戶");
    expect(confirms).toContain("確定刪除「舊帳戶」？這個帳戶還沒有任何紀錄。");
  });

  it("從總覽或紀錄頁的「新增帳戶」連過來（openAdd）_打開新增的視窗一次，之後網址回到帳戶", () => {
    renderToStaticMarkup(createElement(AccountsCard, { accounts: ACCOUNTS, purposes: [], openAdd: true }));
    expect(linkedOpens()).toEqual(["/savings/settings#accounts"]);

    vi.mocked(useLinkedTrigger).mockClear();
    card();
    expect(linkedOpens()).toEqual([]);
  });

  it("信用卡的扣款帳戶只列存款帳戶", () => {
    expect(card()).not.toMatch(/<option value="4">臺銀證券<\/option>/);
  });
});

describe("用途", () => {
  const card = () =>
    renderToStaticMarkup(
      createElement(PurposesCard, {
        purposes: [
          { id: 5, name: "生活費", color: "blue", accountCount: 2 },
          { id: 6, name: "投資", color: "violet", accountCount: 0 },
        ],
      }),
    );

  it("每一列寫出有幾個帳戶在用；點一列修改；刪除的確認說明這些帳戶會改成未設定", () => {
    const markup = card();

    expect(textOf(markup)).toContain("2 個帳戶");
    expect(textOf(markup)).toContain("沒有帳戶使用");
    expect(rowButtons(markup)).toHaveLength(2);
    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.createPurposeAction, actions.updatePurposeAction, actions.updatePurposeAction]);
    expect(deleteConfirms()).toEqual(["確定刪除用途「生活費」？用了這個用途的 2 個帳戶會改成「未設定」，帳戶和紀錄都會留著。", "確定刪除用途「投資」？"]);
  });

  it("⋮ 選單：第一個只能下移、最後一個只能上移", () => {
    const markup = card();

    expect(moves(markup, "「生活費」的選項")).toEqual(["下移"]);
    expect(moves(markup, "「投資」的選項")).toEqual(["上移"]);
  });
});

describe("分類與預算", () => {
  const categories = [
    { id: 11, name: "餐飲", kind: "expense" as const, color: "orange" as const, monthlyBudget: 6000 },
    { id: 21, name: "薪水", kind: "income" as const, color: "green" as const, monthlyBudget: null },
    { id: 12, name: "交通", kind: "expense" as const, color: "blue" as const, monthlyBudget: null },
  ];
  const card = () => renderToStaticMarkup(createElement(CategoriesCard, { categories }));

  it("支出與收入各一組；支出有預算的寫出每月預算，沒設的不寫", () => {
    const markup = card();

    expect(groupTitles(markup)).toEqual(["支出每月預算", "收入"]);
    expect(rowsInGroup(markup, "支出")).toEqual(["修改：餐飲$6,000", "修改：交通"]);
    expect(rowsInGroup(markup, "收入")).toEqual(["修改：薪水"]);
  });

  it("⋮ 選單的上移、下移只在同一類裡", () => {
    const markup = card();

    expect(moves(markup, "「餐飲」的選項")).toEqual(["下移"]);
    expect(moves(markup, "「交通」的選項")).toEqual(["上移"]);
    expect(moves(markup, "「薪水」的選項")).toEqual([]);
  });

  it("⋮ 選單的刪除先確認：紀錄與固定收支改成未分類、紀錄留著", () => {
    card();

    expect(deleteConfirms()).toEqual([
      "確定刪除分類「餐飲」？用了這個分類的紀錄與固定收支會改成「未分類」，紀錄本身會留著。",
      "確定刪除分類「交通」？用了這個分類的紀錄與固定收支會改成「未分類」，紀錄本身會留著。",
      "確定刪除分類「薪水」？用了這個分類的紀錄與固定收支會改成「未分類」，紀錄本身會留著。",
    ]);
  });
});

describe("固定收支", () => {
  const rule: RecurringItem = {
    id: 30,
    kind: "income",
    name: "薪水",
    accountId: 1,
    counterAccountId: null,
    categoryId: 21,
    amount: 52000,
    dayOfMonth: 10,
    intervalMonths: 1,
    startMonth: null,
    holidayRule: "before",
    mode: "confirm",
    holdingId: null,
    allocate: true,
    note: null,
    active: true,
    lastPostedMonth: "2026-10-01",
    createdAt: "2026-09-01T02:00:00.000Z",
    title: "薪水",
    schedule: "每月 10 日 · 遇假日提前 · 到期請我確認",
    nextDate: "2026-11-10",
    accountPaused: false,
  };
  const NETFLIX: RecurringItem = { ...rule, id: 31, kind: "expense", name: "Netflix", title: "Netflix", amount: 390, categoryId: 11, allocate: false, mode: "auto", schedule: "每月 12 日 · 自動記帳", nextDate: "2026-11-12" };
  const options = {
    accounts: [{ id: 1, name: "生活費帳戶", kind: "deposit" as const, active: true }],
    categories: [{ id: 21, name: "薪水", kind: "income" as const }],
    holdings: [],
    today: "2026-10-14",
  };
  const card = (rules: RecurringItem[]) => renderToStaticMarkup(createElement(RecurringCard, { rules, ...options }));

  it("每一列：名稱、排程文字與下一期、預計金額（只有收入帶 +）；點一列修改", () => {
    const markup = card([rule, NETFLIX]);

    expect(rowButtons(markup)).toEqual(["修改：薪水每月 10 日 · 遇假日提前 · 到期請我確認 · 下一期 11/10+$52,000", "修改：Netflix每月 12 日 · 自動記帳 · 下一期 11/12$390"]);
    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.createRecurringAction, actions.updateRecurringAction, actions.updateRecurringAction]);
  });

  it("要確認的那一期到期了還沒處理（在總覽的待處理）_寫「待處理」，跟總覽同一個說法，不寫成下一期", () => {
    expect(rowButtons(card([{ ...rule, nextDate: "2026-10-08" }]))[0]).toContain("待處理 10/8");
  });

  it("停用的標「已停用」；帳戶停用了標「帳戶已停用」；兩種都不寫下一期", () => {
    const markup = card([
      { ...rule, active: false, nextDate: null },
      { ...NETFLIX, accountPaused: true },
    ]);

    expect(chips(markup)).toEqual(["已停用", "帳戶已停用"]);
    expect(rowButtons(markup).join("")).not.toContain("下一期");
  });

  it("⋮ 選單：停用／恢復與刪除（先確認，說明已經記好的紀錄會留著）", () => {
    const forms = menuForms(card([NETFLIX]));

    expect(forms.map((form) => textOf(form))).toEqual(["停用", "刪除固定收支"]);
    expect(deleteConfirms()).toEqual(["確定刪除固定收支「Netflix $390」？已經記好的紀錄會留著。"]);
  });

  it("待處理的選單連過來（openId）_只打開那一條的修改視窗，之後網址回到固定收支", () => {
    renderToStaticMarkup(createElement(RecurringCard, { rules: [rule, NETFLIX], openId: 31, ...options }));

    expect(linkedOpens()).toEqual(["/savings/settings#recurring"]);
    expect(vi.mocked(useLinkedTrigger).mock.calls.map(([, enabled]) => enabled)).toEqual([false, true]);
  });

  it("還沒有任何啟用中的帳戶_不能新增，說明先新增帳戶", () => {
    const markup = renderToStaticMarkup(createElement(RecurringCard, { rules: [], ...options, accounts: [] }));

    expect(markup).not.toContain('aria-label="新增固定收支"');
    expect(textOf(markup)).toContain("先新增帳戶");
  });
});
