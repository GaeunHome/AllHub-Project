import { readFileSync } from "node:fs";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import { addMonths, formatMonth, taipeiMonth } from "../../lib/month";
import { taipeiToday } from "../../lib/dates";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../service/cached", { spy: true });
vi.mock("@/core/ui/dialog", { spy: true });
// 表單另外測 這裡換成看得到收到什麼的按鈕 只檢查總覽傳了什麼
vi.mock("../components/forms/quick-add", () => ({
  QuickAddButton: (p: { accountId?: number; className?: string; label?: string; defaultKind?: string; today: string; accounts: unknown[]; categories: unknown[] }) =>
    createElement("button", { "data-form": "quick-add", "data-account": p.accountId ?? "", "data-class": p.className ?? "", "data-kind": p.defaultKind ?? "", "data-today": p.today, "data-options": JSON.stringify({ accounts: p.accounts, categories: p.categories }) }, p.label ?? "記一筆"),
  QuickAddFab: (p: { today: string; accounts: unknown[] }) => createElement("button", { "data-form": "quick-add-fab", "data-today": p.today, "data-accounts": JSON.stringify(p.accounts) }, "＋"),
}));
vi.mock("../components/forms/salary-dialog", () => ({
  SalaryButton: (p: { accounts: unknown[]; today: string }) => createElement("button", { "data-form": "salary", "data-today": p.today, "data-accounts": JSON.stringify(p.accounts) }, "發薪分配"),
}));
vi.mock("../components/forms/update-balance", () => ({
  UpdateBalanceButton: (p: { account: unknown; className?: string }) => createElement("button", { "data-form": "update-balance", "data-account": JSON.stringify(p.account), "data-class": p.className ?? "" }, "更新餘額"),
}));
vi.mock("../components/forms/setup-button", () => ({
  SetupButton: () => createElement("button", { "data-form": "setup" }, "開始使用"),
  SetupResultSlot: ({ children }: { children?: unknown }) => children,
}));

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedPurposes", "cachedCategories", "cachedAccountFlows", "cachedCategoryTotals", "cachedMonthTransactions", "cachedRecurring");
const dialog = await import("@/core/ui/dialog");
const { SavingsPage, SavingsOverview } = await import("./savings-page");
const sections = await import("../components/dashboard/sections");

const INFO: ModuleInfo = { id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg", accent: "green", notifies: false };
const MONTH = taipeiMonth(new Date());
const PREVIOUS = addMonths(MONTH, -1);
const TODAY = taipeiToday(new Date());
const CREATED = new Date("2025-01-05T02:00:00Z");

const globalsCss = readFileSync(new URL("../../../../app/globals.css", import.meta.url), "utf8");
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const params = (month?: string) => Promise.resolve(month ? { month } : {});
const render = async (node: Promise<ReactNode> | ReactNode) => renderToStaticMarkup((await node) as ReactElement);
const sectionProps = (month = MONTH) => ({ month, current: MONTH });
const attr = (markup: string, form: string, name: string) => [...markup.matchAll(new RegExp(`<button data-form="${form}"[^>]*?${name}="([^"]*)"`, "g"))].map((m) => m[1].replace(/&quot;/g, '"'));

type AccountFixture = { id: number; name: string; kind: "deposit" | "investment" | "credit" } & Partial<Record<"purposeId" | "openingCost" | "monthlyPlan" | "targetAmount" | "dueDay" | "payFromAccountId", number | null>> & { openingBalance?: number; active?: boolean };
const account = ({ openingBalance = 0, active = true, ...rest }: AccountFixture) => ({
  userId: "u",
  purposeId: null,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  payFromAccountId: null,
  sortOrder: rest.id,
  createdAt: CREATED,
  openingBalance,
  active,
  ...rest,
});
const ACCOUNTS = [
  account({ id: 1, name: "國泰", kind: "deposit", purposeId: 1, openingBalance: 50000 }),
  account({ id: 2, name: "郵局", kind: "deposit", purposeId: 2, openingBalance: 7500, monthlyPlan: 2500, targetAmount: 10000 }),
  account({ id: 3, name: "證券 006208", kind: "investment", purposeId: 3, openingBalance: 45000, openingCost: 35000 }),
  account({ id: 4, name: "國泰信用卡", kind: "credit", openingBalance: -8200, dueDay: 15, payFromAccountId: 1 }),
  account({ id: 5, name: "舊帳戶", kind: "deposit", openingBalance: 3000, active: false }),
];
const PURPOSES = [
  { id: 1, userId: "u", name: "生活費", color: "blue", sortOrder: 1, createdAt: CREATED },
  { id: 2, userId: "u", name: "緊急預備金", color: "amber", sortOrder: 2, createdAt: CREATED },
  { id: 3, userId: "u", name: "投資", color: "violet", sortOrder: 3, createdAt: CREATED },
];
const category = (id: number, name: string, kind: "income" | "expense", color: string, monthlyBudget: number | null = null) => ({ id, userId: "u", kind, name, color, monthlyBudget, sortOrder: id, createdAt: CREATED });
const CATEGORIES = [category(1, "薪水", "income", "green"), category(2, "餐飲", "expense", "orange", 6000), category(3, "交通", "expense", "blue", 1500), category(4, "訂閱", "expense", "violet")];
const flow = (accountId: number, month: string, f: Partial<Record<"income" | "expense" | "transferIn" | "transferOut" | "adjust", number>>) => ({ accountId, month, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...f });
const FLOWS = [
  flow(1, PREVIOUS, { income: 43000, expense: 20000 }),
  flow(1, MONTH, { income: 43000, expense: 12000, transferOut: 2500 }),
  flow(2, MONTH, { transferIn: 2500 }),
  flow(3, MONTH, { adjust: 2000 }),
  flow(4, MONTH, { expense: 3000 }),
];
const total = (categoryId: number | null, kind: "income" | "expense", month: string, amount: number) => ({ categoryId, kind, month, amount });
const TOTALS = [
  total(1, "income", PREVIOUS, 43000),
  total(2, "expense", PREVIOUS, 15000),
  total(3, "expense", PREVIOUS, 5000),
  total(1, "income", MONTH, 43000),
  total(2, "expense", MONTH, 5200),
  total(3, "expense", MONTH, 1800),
  total(null, "expense", MONTH, 8000),
];
const transaction = (id: number, kind: string, accountId: number, categoryId: number | null, amount: number, note: string | null = null) => ({
  id,
  userId: "u",
  kind,
  accountId,
  counterAccountId: null,
  categoryId,
  amount,
  date: `${MONTH}-01`,
  note,
  recurringId: null,
  createdAt: CREATED,
  accountName: accountId === 4 ? "國泰信用卡" : "國泰",
  counterAccountName: null,
  categoryName: null,
  categoryColor: null,
  recurring: false,
});
const TRANSACTIONS = [transaction(31, "expense", 1, 2, 5200, "聚餐"), transaction(32, "expense", 4, 3, 1800), transaction(33, "expense", 1, null, 8000, "提款"), transaction(34, "income", 1, 1, 43000)];

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(ACCOUNTS);
  cached.cachedPurposes.mockReset().mockResolvedValue(PURPOSES);
  cached.cachedCategories.mockReset().mockResolvedValue(CATEGORIES);
  cached.cachedAccountFlows.mockReset().mockResolvedValue(FLOWS);
  cached.cachedCategoryTotals.mockReset().mockResolvedValue(TOTALS);
  cached.cachedMonthTransactions.mockReset().mockResolvedValue(TRANSACTIONS);
  cached.cachedRecurring.mockReset().mockResolvedValue([]);
});

describe("理財的總覽頁", () => {
  it("頁首（理財）與分頁列（總覽是目前這一頁），下面的內容各自串流，先出現骨架", () => {
    const markup = renderToStaticMarkup(createElement(SavingsPage, { info: INFO, searchParams: params() }));
    const text = textOf(markup);

    expect(markup).toMatch(/^<div data-accent="green" class="page-stack">/);
    expect(markup).toMatch(/<h1[^>]*>理財<\/h1>/);
    expect(markup).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/savings"|<a [^>]*href="\/savings"[^>]*aria-current="page"/);
    expect(text).toContain("載入總覽…");
  });

  it("整頁的視窗共用一個訊息範圍：新的成功訊息出現時，其他視窗留下的舊訊息就收起來", () => {
    vi.mocked(dialog.DialogMessageScope).mockClear();

    renderToStaticMarkup(createElement(SavingsPage, { info: INFO, searchParams: params() }));

    expect(dialog.DialogMessageScope).toHaveBeenCalledOnce();
  });

  it("由上而下：工具列、數字、資產與支出的圓餅圖、帳戶、預算與趨勢，最後是手機右下角的「＋」；每一區各自有骨架", async () => {
    const markup = await render(SavingsOverview({ searchParams: params() }));
    const order = ["載入工具列…", "載入數字…", "載入資產分布…", "載入支出分類…", "載入帳戶…", "載入預算…", "載入趨勢…"].map((label) => markup.indexOf(label));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("資產與支出的圓餅圖、預算與趨勢在寬螢幕各排成兩欄；不靠第幾個子元素排", async () => {
    const markup = await render(SavingsOverview({ searchParams: params() }));
    // 只算頁面層的兩排 區塊之間是 gap-8 卡片裡依卡片寬度的排法不算
    const grids = [...markup.matchAll(/<div class="(grid gap-8 [^"]*)">/g)].map((m) => m[1]);

    expect(grids).toHaveLength(2);
    for (const grid of grids) expect(grid).toMatch(/(?:^| )lg:grid-cols-/);
    for (const grid of grids) expect(grid).not.toMatch(/nth-|first:|last:|\*:/);
  });

  it("用登入者的 id 讀帳戶、用途與分類", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await SavingsOverview({ searchParams: params() });

    expect(cached.cachedAccounts).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedPurposes).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedCategories).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  describe("還沒有帳戶_歡迎卡取代整個總覽", () => {
    it("第一次使用（也還沒有用途與分類）：說明先建立常用的用途和分類，有「開始使用」與「新增帳戶」", async () => {
      cached.cachedAccounts.mockResolvedValue([]);
      cached.cachedPurposes.mockResolvedValue([]);
      cached.cachedCategories.mockResolvedValue([]);

      const markup = await render(SavingsOverview({ searchParams: params() }));

      expect(textOf(markup)).toContain("第一次使用？先建立常用的用途和分類（之後都能改），再新增帳戶。");
      expect(markup).toContain('data-form="setup"');
      expect(markup).toMatch(/<a [^>]*href="\/savings\/settings\?add=account#accounts"[^>]*>(?:(?!<\/a>).)*新增帳戶/);
      expect(markup).not.toContain("載入數字…");
    });

    it("已經有用途或分類：空狀態加上「新增帳戶」，不再出現「開始使用」", async () => {
      cached.cachedAccounts.mockResolvedValue([]);

      const markup = await render(SavingsOverview({ searchParams: params() }));

      expect(textOf(markup)).toContain("還沒有帳戶");
      expect(markup).not.toContain('data-form="setup"');
      expect(markup).toMatch(/<a [^>]*href="\/savings\/settings\?add=account#accounts"[^>]*>(?:(?!<\/a>).)*新增帳戶/);
    });
  });
});

describe("工具列", () => {
  it("左邊切換月份，右邊是發薪分配與記一筆（主要按鈕）；表單只拿到啟用中的帳戶與台北的今天", async () => {
    const markup = await render(sections.DashboardToolbar(sectionProps()));

    expect(markup).toMatch(/<nav[^>]*aria-label="切換月份"/);
    expect(markup).toMatch(new RegExp(`<option value="${MONTH}" selected`));
    expect(markup.indexOf('aria-label="切換月份"')).toBeLessThan(markup.indexOf('data-form="salary"'));
    expect(markup.indexOf('data-form="salary"')).toBeLessThan(markup.indexOf('data-form="quick-add"'));
    expect(attr(markup, "quick-add", "data-class")).toEqual(["btn-primary max-sm:hidden"]);
    expect(attr(markup, "quick-add", "data-today")).toEqual([TODAY]);
    const salary = JSON.parse(attr(markup, "salary", "data-accounts")[0]) as { id: number; balance: number }[];
    expect(salary.map((a) => a.id)).toEqual([1, 2, 3, 4]);
    expect(salary[0].balance).toBe(101500);
  });

  it("過去的月份_可以回到本月；月份選單從最早有紀錄的月份開始", async () => {
    const markup = await render(sections.DashboardToolbar(sectionProps(PREVIOUS)));

    expect(markup).toMatch(/<a[^>]*href="\/savings"[^>]*>(?:(?!<\/a>).)*回到本月/);
    expect(markup).toMatch(new RegExp(`<option value="${PREVIOUS}" selected`));
  });

  it("用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await sections.DashboardToolbar(sectionProps());

    expect(cached.cachedAccountFlows).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedCategories).toHaveBeenCalledWith(OTHER_SESSION.id);
  });
});

describe("數字卡（總資產、本月收入、支出、存下、信用卡未繳）", () => {
  const tiles = (markup: string) => [...markup.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map((m) => [textOf(m[1]), textOf(m[2].match(/<span class="fin-count-final">(.*?)<\/span>/)![1])]);

  it("本月：五張卡，數字從 0 往上數（報讀器讀最後的數字）；停用的帳戶不算進總資產", async () => {
    const markup = await render(sections.KpiSection(sectionProps()));

    expect(tiles(markup)).toEqual([
      ["總資產", "$158,500"],
      ["本月收入", "$43,000"],
      ["本月支出", "$15,000"],
      ["本月存下", "$28,000"],
      ["信用卡未繳", "$11,200"],
    ]);
  });

  it("總資產附上投資的賺賠", async () => {
    expect(textOf(await render(sections.KpiSection(sectionProps())))).toContain("投資 +$12,000");
  });

  it("卡片依序淡入（--i），不靠第幾個子元素", async () => {
    const markup = await render(sections.KpiSection(sectionProps()));

    expect(markup.match(/class="card fin-rise[^"]*" style="--i:\d"/g)).toHaveLength(5);
  });

  it("過去的月份：收支是那個月的，總資產與信用卡未繳是那個月月底的", async () => {
    const markup = await render(sections.KpiSection(sectionProps(PREVIOUS)));
    const period = PREVIOUS.slice(0, 4) === MONTH.slice(0, 4) ? `${Number(PREVIOUS.slice(5))} 月` : formatMonth(PREVIOUS);

    expect(tiles(markup)).toEqual([
      ["總資產", "$128,500"],
      [`${period}收入`, "$43,000"],
      [`${period}支出`, "$20,000"],
      [`${period}存下`, "$23,000"],
      ["信用卡未繳", "$8,200"],
    ]);
    expect(textOf(markup)).toContain(`${period}底`);
  });

  it("用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await sections.KpiSection(sectionProps());

    expect(cached.cachedAccounts).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedAccountFlows).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedCategoryTotals).toHaveBeenCalledWith(OTHER_SESSION.id);
  });
});

describe("資產分布", () => {
  it("中間是資產合計；依用途分成生活費、緊急預備金、投資（停用的帳戶與信用卡不算）", async () => {
    const markup = await render(sections.AssetSection(sectionProps()));
    const text = textOf(markup);

    expect(text).toContain("資產合計 $158,500，分成 3 類");
    for (const label of ["生活費$101,500", "緊急預備金$10,000", "投資$47,000"]) expect(text).toContain(label);
    expect(text).not.toContain("舊帳戶");
  });

  it("過去的月份：用那個月月底的餘額，標題寫出月份", async () => {
    const markup = await render(sections.AssetSection(sectionProps(PREVIOUS)));

    expect(textOf(markup)).toContain("資產合計 $128,500");
    expect(textOf(markup)).toMatch(/資產分布・.*月底/);
  });

  it("沒有任何餘額大於 0 的存款或投資帳戶_空狀態", async () => {
    cached.cachedAccounts.mockResolvedValue([account({ id: 4, name: "國泰信用卡", kind: "credit", openingBalance: -100 })]);
    cached.cachedAccountFlows.mockResolvedValue([]);

    const text = textOf(await render(sections.AssetSection(sectionProps())));

    expect(text).toContain("還沒有資產可以顯示");
  });
});

describe("支出分類", () => {
  it("中間是這個月的支出合計，片由大到小；這個月的支出紀錄跟著送到瀏覽器，點一片就列出來", async () => {
    const markup = await render(sections.ExpenseSection(sectionProps()));
    const text = textOf(markup);

    expect(text).toContain("本月支出 $15,000，分成 3 類");
    expect(text.indexOf("未分類")).toBeLessThan(text.indexOf("餐飲"));
    expect(text.indexOf("餐飲")).toBeLessThan(text.indexOf("交通"));
    expect(markup).toMatch(/<h2[^>]*>本月支出分類<\/h2>/);
  });

  it("用登入者的 id 讀選到的月份的紀錄", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await sections.ExpenseSection(sectionProps(PREVIOUS));

    expect(cached.cachedMonthTransactions).toHaveBeenCalledWith(OTHER_SESSION.id, PREVIOUS);
    expect(cached.cachedCategoryTotals).toHaveBeenCalledWith(OTHER_SESSION.id);
  });
});

describe("帳戶卡片", () => {
  // 用卡片標題找 表單替身的屬性裡有整份帳戶清單 只比對名稱會找錯
  const cardOf = (markup: string, name: string) => markup.match(new RegExp(`<article[^>]*>(?:(?!</article>).)*<h3[^>]*>${name}</h3>(?:(?!</article>).)*</article>`))![0];

  it("啟用中的帳戶照設定的順序一張一張；停用的不出現", async () => {
    const markup = await render(sections.AccountsSection(sectionProps()));
    const names = [...markup.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((m) => textOf(m[1]));

    expect(names).toEqual(["國泰", "郵局", "證券 006208", "國泰信用卡"]);
    expect(markup.match(/<article[^>]*class="card fin-rise[^"]*"[^>]*style="--i:\d"/g)).toHaveLength(4);
  });

  it("存款：餘額與用途；每張卡片有「記一筆」（帶入這個帳戶）與「更新餘額」兩個小按鈕", async () => {
    const card = cardOf(await render(sections.AccountsSection(sectionProps())), "國泰");

    expect(textOf(card)).toContain("生活費");
    expect(textOf(card)).toContain("$101,500");
    expect(attr(card, "quick-add", "data-account")).toEqual(["1"]);
    expect(attr(card, "quick-add", "data-class")).toEqual(["btn-secondary btn-sm"]);
    expect(JSON.parse(attr(card, "update-balance", "data-account")[0])).toEqual({ id: 1, name: "國泰", kind: "deposit", balance: 101500 });
  });

  it("有目標的帳戶：進度條與還差多少；達到目標時標出來，進度條亮一下", async () => {
    const card = cardOf(await render(sections.AccountsSection(sectionProps())), "郵局");

    expect(textOf(card)).toContain("已達成目標 $10,000");
    expect(card).toContain('data-reached=""');
    expect(textOf(card)).toContain("每月規劃 $2,500");
  });

  it("投資：市值、成本與賺賠", async () => {
    const text = textOf(cardOf(await render(sections.AccountsSection(sectionProps())), "證券 006208"));

    expect(text).toContain("市值");
    expect(text).toContain("$47,000");
    expect(text).toContain("成本 $35,000");
    expect(text).toContain("+$12,000");
  });

  it("信用卡：未繳、繳款日與扣款帳戶繳完剩多少（同一個扣款帳戶的卡一起算）", async () => {
    const card = cardOf(await render(sections.AccountsSection(sectionProps())), "國泰信用卡");
    const text = textOf(card);

    expect(text).toContain("未繳");
    expect(text).toContain("$11,200");
    expect(text).toContain("每月 15 日繳款");
    expect(text).toContain("從「國泰」扣款，繳完剩 $90,300");
    expect(JSON.parse(attr(card, "update-balance", "data-account")[0])).toEqual({ id: 4, name: "國泰信用卡", kind: "credit", balance: -11200 });
  });

  it("扣款帳戶不夠扣_用標籤提醒還差多少", async () => {
    cached.cachedAccountFlows.mockResolvedValue([...FLOWS, flow(4, MONTH, { expense: 120000 })]);

    const text = textOf(cardOf(await render(sections.AccountsSection(sectionProps())), "國泰信用卡"));

    expect(text).toContain("「國泰」不夠扣，還差 $29,700");
  });

  it("看過去的月份時，帳戶卡片仍是目前的餘額（更新餘額、記一筆都是現在的事），標題旁寫明", async () => {
    const markup = await render(sections.AccountsSection(sectionProps(PREVIOUS)));

    expect(textOf(cardOf(markup, "國泰"))).toContain("$101,500");
    expect(textOf(markup)).toContain("目前餘額");
  });

  it("排成 auto-fit 的格線：帳戶少的時候撐滿，不空下一兩欄", async () => {
    expect(await render(sections.AccountsSection(sectionProps()))).toMatch(/class="fin-account-grid"/);
    expect(globalsCss).toMatch(/\.fin-account-grid \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(/);
  });
});

describe("每月預算", () => {
  it("有設預算的支出分類：花了多少／預算、進度條；花到 80% 是黃色標籤、超支是紅色標籤寫出超過多少", async () => {
    const markup = await render(sections.BudgetSection(sectionProps()));
    const text = textOf(markup);

    expect(text).toContain("本月預算");
    expect(text).toContain("$5,200／$6,000");
    expect(text).toContain("快用完了");
    expect(text).toContain("超支 $300");
    expect(markup).toContain('data-tone="warning"');
    expect(markup).toContain('data-tone="danger"');
    expect(text).not.toContain("訂閱");
  });
});

describe("趨勢", () => {
  it("最近 12 個月到本月為止（不受切換的月份影響），選到的月份標成目前", async () => {
    const markup = await render(sections.TrendSection(sectionProps(PREVIOUS)));
    const links = [...markup.matchAll(/<a [^>]*aria-label="[^"]*查看這個月"[^>]*>/g)].map((m) => m[0]);

    expect(links).toHaveLength(12);
    expect(links.at(-1)).toContain(`href="/savings?month=${MONTH}"`);
    expect(links.filter((link) => link.includes('aria-current="true"'))[0]).toContain(`month=${PREVIOUS}`);
  });
});

describe("手機右下角的「＋」", () => {
  it("跟記一筆用同一份清單", async () => {
    const markup = await render(sections.QuickAddFabSection());

    expect(attr(markup, "quick-add-fab", "data-today")).toEqual([TODAY]);
    expect(JSON.parse(attr(markup, "quick-add-fab", "data-accounts")[0])).toHaveLength(4);
  });
});
