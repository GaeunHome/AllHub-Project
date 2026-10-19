import { Fragment, createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { menuOf } from "@/dev/more-menu-stub";
import { markup as render, textOf } from "@/dev/test-helpers";

// 視窗與選單關著時不算繪內容 換成直接算繪才看得到表單與選單裡的按鈕
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/more-menu", () => import("@/dev/more-menu-stub"));
// 刪除鈕 要看交給它的確認訊息
vi.mock("@/core/ui/action-button", { spy: true });
vi.mock("../forms/setup-button", () => ({ SetupButton: () => createElement("button", { "data-form": "setup" }, "開始使用") }));
vi.mock("../../actions", () => ({
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
  moveCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
}));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const { CategoriesCard } = await import("./categories-card");

const menuForms = (markup: string) => [...markup.matchAll(/<form[^>]*>((?:(?!<\/form>)[\s\S])*)<\/form>/g)].map((m) => m[1]).filter((form) => form.includes('class="menu-item'));
// 報讀器先念修改 只認整列的按鈕 不算新增
const rowButtons = (markup: string) =>
  [...markup.matchAll(/<button[^>]*aria-haspopup="dialog"[^>]*>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].map((m) => m[1]).filter((html) => textOf(html).startsWith("修改："));
const cards = (markup: string) => markup.split(/<section /).slice(1);
const titleOf = (card: string) => textOf(card.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "");
const iconOf = (html: string) => html.match(/--icon-url:url\(&quot;\/icons\/ui\/([\w-]+)\.svg&quot;\)/)?.[1];
const moves = (markup: string, label: string) =>
  menuForms(menuOf(markup, label))
    .filter((form) => form.includes('name="direction"'))
    .map((form) => textOf(form));
const deleteConfirms = () =>
  vi
    .mocked(ActionButton)
    .mock.calls.filter(([props]) => String(props.className).includes("menu-item-danger"))
    .map(([props]) => props.confirmMessage);

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
});

describe("分類與預算", () => {
  const categories = [
    { id: 11, name: "餐飲", kind: "expense" as const, color: "orange" as const, monthlyBudget: 6000, icon: "utensils" },
    { id: 21, name: "薪水", kind: "income" as const, color: "green" as const, monthlyBudget: null, icon: "briefcase" },
    { id: 12, name: "交通", kind: "expense" as const, color: "blue" as const, monthlyBudget: null, icon: null },
  ];
  const card = () => render(createElement(CategoriesCard, { categories }));

  it("支出與收入各一張卡片；支出有預算的寫出每月預算，沒設的不寫；點一列修改", () => {
    const [expense, income] = cards(card());

    expect(titleOf(expense)).toContain("支出");
    expect(rowButtons(expense).map((html) => textOf(html))).toEqual(["修改：餐飲預算 $6,000", "修改：交通"]);
    expect(titleOf(income)).toContain("收入");
    expect(rowButtons(income).map((html) => textOf(html))).toEqual(["修改：薪水"]);
  });

  it("每一列前面是分類的圖示：有選圖示的用它，沒選的也有一個預設的圖示，不會空一格", () => {
    const [expense] = cards(card());
    const [food, transport] = rowButtons(expense);

    expect(iconOf(food)).toBe("utensils");
    expect(iconOf(transport)).toBeTruthy();
  });

  it("新增與修改都在視窗裡：新增送到 createCategoryAction，每一列送到 updateCategoryAction", () => {
    card();

    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([
      actions.createCategoryAction,
      actions.updateCategoryAction,
      actions.updateCategoryAction,
      actions.createCategoryAction,
      actions.updateCategoryAction,
    ]);
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

  it("還沒有任何分類_一張卡片說明，放「開始使用」（建預設的分類）與自己新增", () => {
    const markup = render(createElement(CategoriesCard, { categories: [] }));

    expect(cards(markup)).toHaveLength(1);
    expect(markup).toContain('data-form="setup"');
    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.createCategoryAction]);
  });
});
