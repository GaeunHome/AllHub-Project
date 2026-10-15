import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 視窗與選單關著時不算繪內容 換成直接算繪才看得到表單與選單裡的按鈕
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/more-menu", () => ({ MoreMenu: ({ label, children }: { label: string; children: ReactNode }) => createElement("div", { "data-menu": label }, children) }));
// 刪除鈕 要看交給它的確認訊息
vi.mock("@/core/ui/action-button", { spy: true });
// effect 另外在 open-from-link.effect.test.ts 測
// 真的 hook 要有路由才能算繪 這裡換成空的
vi.mock("./open-from-link", () => ({ useOpenFromLink: vi.fn() }));
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
const { AccountsCard } = await import("./accounts-card");
const { PurposesCard } = await import("./purposes-card");
const { CategoriesCard } = await import("./categories-card");
const { RecurringCard } = await import("./recurring-card");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
/** 選單裡 ActionButton 表單的內容 含隱藏欄位與選單項目的按鈕 */
const menuForms = (markup: string) => [...markup.matchAll(/<form[^>]*>((?:(?!<\/form>)[\s\S])*)<\/form>/g)].map((m) => m[1]).filter((form) => form.includes('class="menu-item'));
/** 用報讀器的名稱找按鈕 因為屬性的順序不固定 */
const buttonOf = (markup: string, label: string) => markup.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

const base = {
  purposeId: null,
  openingBalance: 0,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  payFromAccountId: null,
  active: true,
  purposeName: null,
  purposeColor: null,
  payFromName: null,
  recurringCount: 0,
  hasRecords: true,
  hasTransfers: false,
};
const ACCOUNTS = [
  { ...base, id: 1, name: "國泰", kind: "deposit" as const, purposeId: 5, purposeName: "生活費", purposeColor: "blue" as const, monthlyPlan: 5000, targetAmount: 100000, recurringCount: 2, hasTransfers: true },
  { ...base, id: 3, name: "國泰信用卡", kind: "credit" as const, openingBalance: -3500, dueDay: 6, payFromAccountId: 1, payFromName: "國泰" },
  { ...base, id: 8, name: "舊帳戶", kind: "deposit" as const, active: false, hasRecords: false },
];
/** 選單裡刪除鈕的確認訊息 照列的順序 */
const deleteConfirms = () => vi.mocked(ActionButton).mock.calls.filter(([props]) => String(props.className).includes("menu-item-danger")).map(([props]) => props.confirmMessage);

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
});

describe("帳戶", () => {
  const card = () => renderToStaticMarkup(createElement(AccountsCard, { accounts: ACCOUNTS, purposes: [{ id: 5, name: "生活費" }] }));

  it("每一列：類型與設定（每月規劃、目標；信用卡是繳款日與扣款帳戶）、用途標籤、停用的標出來", () => {
    const text = textOf(card());

    expect(text).toContain("存款 · 每月規劃 $5,000 · 目標 $100,000");
    expect(text).toContain("信用卡 · 每月 6 日繳款 · 從「國泰」扣款");
    expect(text).toContain("生活費");
    expect(text).toContain("已停用");
  });

  it("調整順序：第一個不能往上、最後一個不能往下", () => {
    const markup = card();

    expect(buttonOf(markup, "把「國泰」往上移")).toContain('disabled=""');
    expect(buttonOf(markup, "把「國泰」往下移")).not.toContain("disabled");
    expect(buttonOf(markup, "把「舊帳戶」往下移")).toContain('disabled=""');
  });

  it("手機上調整順序收在 ⋮ 選單（寬螢幕藏起來）：第一個只能往下、最後一個只能往上", () => {
    const markup = card();
    const moves = (label: string) =>
      menuForms(markup.split(`data-menu="${label}"`)[1].split("data-menu=")[0])
        .filter((form) => form.includes('name="direction"'))
        .map((form) => textOf(form));

    expect(moves("「國泰」的選項")).toEqual(["往下移"]);
    expect(moves("「國泰信用卡」的選項")).toEqual(["往上移", "往下移"]);
    expect(moves("「舊帳戶」的選項")).toEqual(["往上移"]);
    expect(markup).toMatch(/<form[^>]*class="flex flex-col gap-1 sm:hidden"[^>]*><input type="hidden" name="id" value="1"\/><input type="hidden" name="direction" value="down"/);
  });

  it("⋮ 選單：停用的帳戶是「恢復」，其他是「停用」；送出的值是相反的狀態", () => {
    const forms = menuForms(card()).filter((form) => form.includes('name="active"'));

    expect(forms.map((form) => [form.match(/name="id" value="(\d+)"/)?.[1], form.match(/name="active" value="(\w+)"/)?.[1], textOf(form)])).toEqual([
      ["1", "false", "停用"],
      ["3", "false", "停用"],
      ["8", "true", "恢復"],
    ]);
  });

  it("新增帳戶的視窗送到 createAccountAction；每一列的修改送到 updateAccountAction；扣款帳戶只列存款帳戶", () => {
    const markup = card();

    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.createAccountAction, actions.updateAccountAction, actions.updateAccountAction, actions.updateAccountAction]);
    expect(markup).not.toMatch(/<option value="3">國泰信用卡<\/option>/);
  });

  it("⋮ 選單的刪除先確認：紀錄、固定收支會一起刪；有轉帳的說其他帳戶的餘額會變；還沒有紀錄的直接說", () => {
    card();

    const [cathay, creditCard, old] = deleteConfirms();
    expect(cathay).toContain("確定刪除「國泰」？這個帳戶的所有紀錄和 2 筆固定收支都會一起刪除，無法復原。");
    expect(cathay).toContain("那些帳戶的餘額會跟著改變");
    expect(creditCard).not.toContain("其他帳戶");
    expect(old).toBe("確定刪除「舊帳戶」？這個帳戶還沒有任何紀錄。");
  });
});

describe("用途", () => {
  it("每一列寫出有幾個帳戶在用；刪除的確認說明這些帳戶會改成未設定", () => {
    const markup = renderToStaticMarkup(
      createElement(PurposesCard, {
        purposes: [
          { id: 5, name: "生活費", color: "blue", accountCount: 2 },
          { id: 6, name: "投資", color: "violet", accountCount: 0 },
        ],
      }),
    );

    expect(textOf(markup)).toContain("2 個帳戶");
    expect(textOf(markup)).toContain("沒有帳戶使用");
    expect(markup).toMatch(/data-menu="「生活費」的選項"/);
    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.createPurposeAction, actions.updatePurposeAction, actions.updatePurposeAction]);
    expect(deleteConfirms()).toEqual(["確定刪除用途「生活費」？用了這個用途的 2 個帳戶會改成「未設定」，帳戶和紀錄都會留著。", "確定刪除用途「投資」？"]);
  });
});

describe("分類", () => {
  const categories = [
    { id: 11, name: "餐飲", kind: "expense" as const, color: "orange" as const, monthlyBudget: 6000 },
    { id: 12, name: "交通", kind: "expense" as const, color: "blue" as const, monthlyBudget: null },
    { id: 21, name: "薪水", kind: "income" as const, color: "green" as const, monthlyBudget: null },
  ];

  it("預設看支出的分類（有沒有設預算都寫出來），收入的分類在切換後才列；順序只在同一類裡調整", () => {
    const markup = renderToStaticMarkup(createElement(CategoriesCard, { categories }));
    const text = textOf(markup);

    expect(markup).toMatch(/role="group" aria-label="分類的類型"/);
    expect(text).toContain("每月預算 $6,000");
    expect(text).toContain("沒有設預算");
    expect(text).not.toContain("薪水");
    expect(buttonOf(markup, "把「交通」往下移")).toContain('disabled=""');
    expect(buttonOf(markup, "把「餐飲」往下移")).not.toContain("disabled");
  });

  it("⋮ 選單的刪除先確認：紀錄與固定收支改成未分類、紀錄留著", () => {
    renderToStaticMarkup(createElement(CategoriesCard, { categories }));

    expect(deleteConfirms()).toEqual([
      "確定刪除分類「餐飲」？用了這個分類的紀錄與固定收支會改成「未分類」，紀錄本身會留著。",
      "確定刪除分類「交通」？用了這個分類的紀錄與固定收支會改成「未分類」，紀錄本身會留著。",
    ]);
  });
});

describe("固定收支", () => {
  const rule = {
    id: 30,
    kind: "expense" as const,
    accountId: 1,
    counterAccountId: null,
    categoryId: 11,
    amount: 15000,
    dayOfMonth: 6,
    note: "房租",
    active: true,
    lastPostedMonth: "2026-10-01",
    createdAt: "2026-09-01T02:00:00.000Z",
    accountName: "國泰",
    counterAccountName: null,
    categoryName: "餐飲",
    categoryColor: "orange" as const,
    nextDate: "2026-11-06",
    accountPaused: false,
  };
  const options = { accounts: [{ id: 1, name: "國泰", kind: "deposit" as const, active: true }], categories: [{ id: 11, name: "餐飲", kind: "expense" as const, color: "orange" as const }], today: "2026-10-14" };

  it("每一列：每月幾日、名稱、金額、帳戶與備註、下次日期", () => {
    const text = textOf(renderToStaticMarkup(createElement(RecurringCard, { rules: [rule], ...options })));

    expect(text).toContain("每月 6 日");
    expect(text).toContain("-$15,000");
    expect(text).toContain("支出 · 國泰 · 房租 · 下次：11 月 6 日（五）");
  });

  it("停用的標「已停用」；帳戶停用了也標出來（排程會略過，不寫下次日期）", () => {
    const text = textOf(renderToStaticMarkup(createElement(RecurringCard, { rules: [{ ...rule, active: false, nextDate: null }, { ...rule, id: 31, accountPaused: true }], ...options })));

    expect(text).toContain("已停用");
    expect(text).toContain("帳戶已停用，不會自動記");
    expect(text).not.toContain("下次：");
  });

  it("⋮ 選單：停用／恢復與刪除（先確認，說明自動記好的紀錄會留著）", () => {
    const forms = menuForms(renderToStaticMarkup(createElement(RecurringCard, { rules: [rule], ...options })));

    expect(forms.map((form) => textOf(form))).toEqual(["停用", "刪除固定收支"]);
    expect(deleteConfirms()).toEqual(["確定刪除固定收支「每月 6 日 餐飲 -$15,000」？已經自動記好的紀錄會留著，只是不再標「自動」。"]);
  });

  it("還沒有任何啟用中的帳戶_不能新增，空狀態說明先新增帳戶", () => {
    const markup = renderToStaticMarkup(createElement(RecurringCard, { rules: [], ...options, accounts: [] }));

    expect(textOf(markup)).not.toContain("新增固定收支");
    expect(textOf(markup)).toContain("先新增帳戶");
  });
});
