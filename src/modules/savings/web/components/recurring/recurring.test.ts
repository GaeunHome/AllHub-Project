import { Fragment, createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { menuOf, outsideMenus } from "@/dev/more-menu-stub";
import { markup as render, textOf } from "@/dev/test-helpers";
import { accountRow, ruleRow } from "../../../dev/fixtures";
import type { AccountBalance } from "../../../lib/ledger";
import type { PendingRuleRow } from "../../../lib/pending";

// 視窗與選單關著時不算繪內容 換成直接算繪才看得到表單與選單裡的按鈕
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/more-menu", () => import("@/dev/more-menu-stub"));
// 略過與刪除 要看交給它的確認訊息
vi.mock("@/core/ui/action-button", { spy: true });
// 真的 hook 要有路由才能算繪 這裡換成只記下要不要打開
vi.mock("../settings/open-from-link", () => ({ useOpenFromLink: vi.fn(), useLinkedTrigger: vi.fn((dialog: { triggerProps: unknown }) => dialog.triggerProps) }));
vi.mock("../../actions", () => ({
  createRecurringAction: vi.fn(),
  updateRecurringAction: vi.fn(),
  setRecurringActiveAction: vi.fn(),
  deleteRecurringAction: vi.fn(),
  skipOccurrenceAction: vi.fn(),
  confirmOccurrenceAction: vi.fn(),
  allocateSalaryAction: vi.fn(),
  updateAllocationAction: vi.fn(),
}));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const { useLinkedTrigger } = await import("../settings/open-from-link");
const { recurringPageView } = await import("../../recurring-view");
const { RegularBuyList } = await import("./regular-buy-list");
const { OtherRecurringList } = await import("./other-recurring-list");
const { SalarySection } = await import("./salary-section");

// 今天是 2026-10-16 星期五
const TODAY = "2026-10-16";
const ACCOUNTS = [
  accountRow({ id: 1, name: "生活費帳戶", kind: "deposit" }),
  accountRow({ id: 2, name: "台銀", kind: "deposit", monthlyPlan: 5000 }),
  accountRow({ id: 3, name: "緊急預備金 A", kind: "deposit", monthlyPlan: 2000, targetAmount: 10000 }),
  accountRow({ id: 6, name: "臺銀證券", kind: "investment" }),
];
const balance = (amount: number): AccountBalance => ({ balance: amount, cost: null, profit: null, owed: null });
const BALANCES = new Map([
  [1, balance(20000)],
  [2, balance(3000)],
  [3, balance(8500)],
  [6, balance(0)],
]);
const CATEGORIES = [
  { id: 11, name: "房租", kind: "expense" as const, color: "orange" as const, monthlyBudget: null, icon: "house" },
  { id: 21, name: "薪水", kind: "income" as const, color: "green" as const, monthlyBudget: null, icon: "briefcase" },
];
const HOLDINGS = [{ id: 50, accountId: 6, symbol: "006208", name: "富邦台灣50", shares: 238, cost: 24000, sortOrder: 0 }];

// 預設是 8/1 建立 每月 20 日要確認的房租
const rule = (id: number, fields: Partial<PendingRuleRow>): PendingRuleRow => ruleRow({ id, categoryId: 11, ...fields });
// 10/10 是週六 10/9 放假 提前到 10/8 已經過了
const SALARY = rule(30, { kind: "income", name: "薪水", categoryId: 21, amount: 52000, dayOfMonth: 10, holidayRule: "before", allocate: true });
const REGULAR = rule(31, { kind: "transfer", accountId: 2, counterAccountId: 6, categoryId: null, holdingId: 50, amount: 5000, dayOfMonth: 5, holidayRule: "after" });
// 10/20 還有 4 天
const RENT = rule(32, { name: "房租" });
const NETFLIX = rule(34, { name: "Netflix", mode: "auto", amount: 390, dayOfMonth: 12, lastPostedMonth: "2026-10-01" });
const GYM = rule(35, { name: "健身房", active: false });

const viewOf = (rules: PendingRuleRow[]) => recurringPageView({ accounts: ACCOUNTS, rules, categories: CATEGORIES, holdings: HOLDINGS, quotes: null, balances: BALANCES, today: TODAY });

const buttonsOf = (markup: string) => [...markup.matchAll(/<button[^>]*>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].map((m) => textOf(m[1]).trim());
const menuItems = (markup: string, label: string) => buttonsOf(menuOf(markup, label));
const dialogActions = () => vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action);
const confirms = () => vi.mocked(ActionButton).mock.calls.map(([props]) => props.confirmMessage);

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(useLinkedTrigger).mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
});

describe("定期定額（投資頁與每月固定頁共用）", () => {
  const list = (props: Record<string, unknown> = {}) => {
    const view = viewOf([REGULAR]);
    return render(createElement(RegularBuyList, { items: view.regularBuys, form: view.form, ...props }));
  };

  it("每一列：代號、哪一檔、排程、從哪個帳戶扣、扣款金額", () => {
    const text = textOf(list());

    expect(text).toContain("006208");
    expect(text).toContain("富邦台灣50");
    expect(text).toContain("每月 5 日（遇假日延後） · 從台銀扣");
    expect(text).toContain("$5,000");
  });

  it("到期時「確認」直接在列上，不用打開 ⋮；打開的是確認這一期的視窗", () => {
    const markup = list();

    expect(buttonsOf(outsideMenus(markup))).toContain("確認");
    expect(dialogActions()).toContain(actions.confirmOccurrenceAction);
  });

  it("⋮ 只放不常用的：修改、略過這一期（到期時）、停用、刪除", () => {
    expect(menuItems(list(), "「006208 定期定額」的選項")).toEqual(["修改", "略過這一期", "停用", "刪除"]);
  });

  it("新增定期定額不用選類型，直接選扣款帳戶與哪一檔", () => {
    const markup = list();

    expect(markup).not.toContain('role="group" aria-label="類型"');
    expect(markup).toMatch(/<select[^>]*name="holdingId"/);
    expect(dialogActions()).toContain(actions.createRecurringAction);
  });

  it("還沒有持股_不能新增，說明先新增持股；每月固定頁連到投資頁", () => {
    const view = viewOf([]);
    const markup = render(createElement(RegularBuyList, { items: [], form: { ...view.form, holdings: [] } }));

    expect(markup).not.toContain('aria-label="新增定期定額"');
    expect(textOf(markup)).toContain("先新增持股");
    expect(markup).toMatch(/<a [^>]*href="\/savings\/investments"/);
  });
});

describe("其他固定收支", () => {
  const list = (rules = [RENT, NETFLIX, GYM], props: Record<string, unknown> = {}) => {
    const view = viewOf(rules);
    return render(createElement(OtherRecurringList, { items: view.others, form: view.form, ...props }));
  };

  it("到期時「確認」「略過」直接在列上；略過先確認", () => {
    const markup = list([RENT]);

    expect(buttonsOf(outsideMenus(markup))).toEqual(expect.arrayContaining(["確認", "略過"]));
    expect(vi.mocked(ActionButton).mock.calls.find(([props]) => props.fields.period === "2026-10")?.[0].confirmMessage).toBeTruthy();
  });

  it("⋮：修改、停用、刪除（刪除先確認，已經記好的紀錄會留著）", () => {
    const markup = list([NETFLIX]);

    expect(menuItems(markup, "「Netflix」的選項")).toEqual(["修改", "停用", "刪除"]);
    expect(confirms()).toContainEqual(expect.stringContaining("紀錄會留著"));
  });

  it("每一列：分類的圖示、名稱、排程與下一期；自動記帳的不用處理，列上沒有按鈕", () => {
    const markup = list([NETFLIX]);

    expect(textOf(markup)).toContain("每月 12 日 · 自動記帳 · 下一期 11/12");
    expect(buttonsOf(outsideMenus(markup)).filter((text) => text === "確認" || text === "略過")).toEqual([]);
  });

  it("停用的標「已停用」，可以從 ⋮ 恢復", () => {
    const markup = list([GYM]);

    expect(markup).toMatch(/<span class="chip">已停用<\/span>/);
    expect(menuItems(markup, "「健身房」的選項")).toContain("恢復");
  });

  it("點名稱就是修改；從別頁的修改連過來（edit=id）只打開那一條", () => {
    list([RENT, NETFLIX], { openEditId: 34 });

    expect(vi.mocked(useLinkedTrigger).mock.calls.map(([, enabled]) => enabled)).toEqual([false, false, true]);
  });

  it("新增是支出、收入、轉帳（薪水與定期定額在自己那一區）", () => {
    const markup = list([]);

    expect(textOf(markup.match(/<div role="group" aria-label="類型"[\s\S]*?<\/div>/)?.[0] ?? "")).toBe("支出收入轉帳");
  });

  it("新增的分類膠囊畫各分類選的圖示，跟記一筆一樣（發生過全部都是預設的圖示）", () => {
    const chipIcon = (markup: string, id: number) => markup.match(new RegExp(`name="categoryId" value="${id}"[^>]*/><span[^>]*/icons/ui/([\\w-]+)\\.svg`))?.[1];

    expect(chipIcon(list([]), 11)).toBe("house");
  });
});

describe("薪水", () => {
  const section = (rules = [SALARY]) => {
    const view = viewOf(rules);
    return render(createElement(SalarySection, { items: view.salaries, form: view.form, salaryAccounts: view.salaryAccounts, allocationAccounts: view.allocationAccounts }));
  };

  it("每條薪水寫發薪日（遇假日提前）、入帳到哪個帳戶與預計金額", () => {
    const text = textOf(section());

    expect(text).toContain("每月 10 日（遇假日提前） · 入帳到生活費帳戶");
    expect(text).toContain("+$52,000");
  });

  it("到期時「入帳並分配」直接在列上；打開的是發薪分配，帶著那一期", () => {
    const markup = section();

    expect(buttonsOf(outsideMenus(markup))).toContain("入帳並分配");
    expect(markup).toMatch(/<input type="hidden" name="ruleId" value="30"/);
    expect(markup).toMatch(/<input type="hidden" name="period" value="2026-10"/);
    expect(dialogActions()).toContain(actions.allocateSalaryAction);
  });

  it("入帳後怎麼分配：每個帳戶轉多少（有目標的分到目標為止），剩下的留在入帳帳戶", () => {
    const text = textOf(section());

    // 緊急預備金 A 有 8500 離目標 10000 差 1500 留下 52000 減 5000 減 1500 是 45500
    expect(text).toContain("台銀$5,000");
    expect(text).toMatch(/緊急預備金 A[^$]*\$1,500/);
    expect(text).toContain("留在生活費帳戶$45,500");
  });

  it("修改分配：每個帳戶送 accountId、monthlyPlan:<id>、targetAmount:<id>，送到 updateAllocationAction；入帳帳戶不在裡面", () => {
    const markup = section();
    const ids = [...markup.matchAll(/<input type="hidden" name="accountId" value="(\d+)"/g)].map((m) => m[1]);

    expect(ids).toEqual(["2", "3"]);
    expect(markup).toMatch(/name="monthlyPlan:2"[^>]*value="5000"|value="5000"[^>]*name="monthlyPlan:2"/);
    expect(markup).toMatch(/name="targetAmount:3"[^>]*value="10000"|value="10000"[^>]*name="targetAmount:3"/);
    expect(dialogActions()).toContain(actions.updateAllocationAction);
  });

  it("只有信用卡（沒有能入帳的帳戶）_從開始設定的「設定薪水」連過來也不打開表單，入帳帳戶不會是空的選單", () => {
    const view = recurringPageView({ accounts: [accountRow({ id: 5, name: "國泰卡", kind: "credit" })], rules: [], categories: CATEGORIES, holdings: [], quotes: null, balances: new Map(), today: TODAY });

    render(createElement(SalarySection, { items: [], form: view.form, salaryAccounts: view.salaryAccounts, allocationAccounts: view.allocationAccounts, openAdd: true }));

    expect(vi.mocked(useLinkedTrigger).mock.calls.map(([, enabled]) => enabled)).toEqual([false]);
  });

  it("還沒有薪水_說明並放「設定薪水」，打開的表單已經選好薪水", () => {
    const markup = section([]);

    expect(buttonsOf(markup)).toContain("設定薪水");
    expect(markup).toMatch(/<input type="hidden" name="allocate" value="on"/);
  });
});
