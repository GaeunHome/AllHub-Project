import { describe, expect, it } from "vitest";
import {
  accountBalances,
  accountStartDate,
  assetSlices,
  assetSummary,
  balanceAdjustment,
  balanceFromFigure,
  budgetRows,
  bySortOrder,
  creditCardStatuses,
  earliestFlowMonth,
  expenseSlices,
  monthTotals,
  negativeAccounts,
  roundedPercent,
  shownFigure,
  suggestAllocation,
  targetProgress,
  trendSeries,
  type AccountBalance,
  type AccountLike,
  type AccountMonthFlow,
  type AllocationAccount,
  type CategoryLike,
  type CategoryMonthTotal,
  type PurposeLike,
  type Slice,
} from "./ledger";

/** 台北時間當天中午建立 */
const createdOn = (date: string) => new Date(`${date}T04:00:00Z`);

let nextId = 1;
function account(overrides: Partial<AccountLike> = {}): AccountLike {
  const id = overrides.id ?? nextId++;
  return {
    id,
    name: `帳戶${id}`,
    kind: "deposit",
    purposeId: null,
    openingBalance: 0,
    openingCost: null,
    monthlyPlan: null,
    targetAmount: null,
    dueDay: null,
    payFromAccountId: null,
    active: true,
    sortOrder: id,
    createdAt: createdOn("2026-01-10"),
    ...overrides,
  };
}

const flow = (accountId: number, month: string, amounts: Partial<Omit<AccountMonthFlow, "accountId" | "month">>): AccountMonthFlow => ({
  accountId,
  month,
  income: 0,
  expense: 0,
  transferIn: 0,
  transferOut: 0,
  adjust: 0,
  ...amounts,
});

const balanceOf = (balance: number, extra: Partial<AccountBalance> = {}): AccountBalance => ({ balance, cost: null, profit: null, owed: null, ...extra });
const balancesOf = (entries: [number, number][]) => new Map(entries.map(([id, balance]) => [id, balanceOf(balance)]));
/** 浮點數相加會有誤差 百分比先換成千分之幾的整數再加總 畫面只顯示到小數一位 */
const tenthsTotal = (slices: Slice[]) => slices.reduce((total, slice) => total + Math.round(slice.percent * 10), 0);

describe("bySortOrder 與 roundedPercent（共用的小工具）", () => {
  it("照排序值、同排序值再照 id_任何有這兩個欄位的資料都能用", () => {
    const rows = [
      { id: 3, sortOrder: 1, label: "c" },
      { id: 1, sortOrder: 1, label: "a" },
      { id: 2, sortOrder: 0, label: "b" },
    ];

    expect([...rows].sort(bySortOrder).map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it("百分比四捨五入到小數一位_先乘再除，0.57 這類數字不會差一點", () => {
    expect(roundedPercent(1, 3)).toBe(33.3);
    expect(roundedPercent(2, 3)).toBe(66.7);
    expect(roundedPercent(57, 100)).toBe(57);
    expect(roundedPercent(1, 1)).toBe(100);
  });
});

describe("信用卡的數字（畫面上的未繳）與餘額的換算：全站同一套", () => {
  it("shownFigure_信用卡是 0 減餘額（未繳；負的是溢繳）、存款與投資就是餘額", () => {
    expect(shownFigure("credit", -1200)).toBe(1200);
    expect(shownFigure("credit", 300)).toBe(-300);
    expect(Object.is(shownFigure("credit", 0), 0)).toBe(true);
    expect(shownFigure("deposit", 5000)).toBe(5000);
    expect(shownFigure("deposit", -50)).toBe(-50);
    expect(shownFigure("investment", 89_200)).toBe(89_200);
  });

  it("balanceFromFigure_倒過來：信用卡的未繳換回負的餘額、溢繳換回正的", () => {
    expect(balanceFromFigure("credit", 1800)).toBe(-1800);
    expect(balanceFromFigure("credit", -300)).toBe(300);
    expect(Object.is(balanceFromFigure("credit", 0), 0)).toBe(true);
    expect(balanceFromFigure("deposit", 12_000)).toBe(12_000);
    expect(balanceFromFigure("investment", 95_000)).toBe(95_000);
  });

  it("balanceAdjustment_輸入的數字換成餘額再減掉目前的餘額", () => {
    expect(balanceAdjustment("deposit", 12_300, 12_000)).toBe(-300);
    expect(balanceAdjustment("investment", 90_000, 95_000)).toBe(5000);
    // 未繳從 1,000 變 1,800 再欠 800
    expect(balanceAdjustment("credit", -1000, 1800)).toBe(-800);
    expect(balanceAdjustment("credit", -1800, 0)).toBe(1800);
  });

  it("balanceAdjustment_溢繳的卡（餘額是正的）輸入 0 是把餘額調回 0；輸入一樣的負數沒有差額", () => {
    expect(balanceAdjustment("credit", 500, 0)).toBe(-500);
    expect(balanceAdjustment("credit", 500, -500)).toBe(0);
    expect(balanceAdjustment("credit", -200, -300)).toBe(500);
  });

  it("每個類型、每種餘額都換得回來", () => {
    for (const kind of ["deposit", "investment", "credit"] as const) {
      for (const balance of [-3500, 0, 1, 42_000]) {
        expect(balanceFromFigure(kind, shownFigure(kind, balance))).toBe(balance);
        expect(balanceAdjustment(kind, balance, shownFigure(kind, balance))).toBe(0);
      }
    }
  });
});

describe("accountStartDate（開始記帳的那天：起始餘額是那天的餘額）", () => {
  it("建立帳戶的台北日期_UTC 10/13 16:30 是台北 10/14，15:59 還是 10/13", () => {
    expect(accountStartDate({ createdAt: new Date("2026-10-13T16:30:00Z") })).toBe("2026-10-14");
    expect(accountStartDate({ createdAt: new Date("2026-10-13T15:59:59Z") })).toBe("2026-10-13");
    expect(accountStartDate(account({ createdAt: createdOn("2026-10-14") }))).toBe("2026-10-14");
  });
});

describe("accountBalances（餘額＝起始＋收入−支出−轉出＋轉入＋調整）", () => {
  it("存款_所有月份加總_沒有成本、賺賠與未繳", () => {
    const deposit = account({ id: 1, openingBalance: 10_000 });
    const flows = [flow(1, "2026-01", { income: 50_000, expense: 3000 }), flow(1, "2026-02", { transferOut: 20_000, adjust: -500 })];

    expect(accountBalances([deposit], flows).get(1)).toEqual({ balance: 36_500, cost: null, profit: null, owed: null });
  });

  it("投資_轉入加成本、轉出減成本_收入支出與調整只改餘額_賺賠是市值減成本", () => {
    const investment = account({ id: 2, kind: "investment", openingBalance: 80_000, openingCost: 75_000 });
    const flows = [flow(2, "2026-02", { transferIn: 10_000 }), flow(2, "2026-03", { transferOut: 5000, income: 300, expense: 100, adjust: 4000 })];

    expect(accountBalances([investment], flows).get(2)).toEqual({ balance: 89_200, cost: 80_000, profit: 9200, owed: null });
  });

  it("投資沒填成本_成本從起始市值算起", () => {
    const investment = account({ id: 3, kind: "investment", openingBalance: 50_000 });

    expect(accountBalances([investment], [flow(3, "2026-02", { transferIn: 1000, adjust: -2000 })]).get(3)).toEqual({ balance: 49_000, cost: 51_000, profit: -2000, owed: null });
  });

  it("信用卡_刷卡讓餘額更負_繳款（轉入）抵掉_未繳是負餘額的絕對值", () => {
    const card = account({ id: 4, kind: "credit", openingBalance: -3500 });
    const flows = [flow(4, "2026-02", { expense: 1200, transferIn: 3500 })];

    expect(accountBalances([card], flows).get(4)).toEqual({ balance: -1200, cost: null, profit: null, owed: 1200 });
  });

  it("信用卡繳多了（餘額是正的）_未繳是 0", () => {
    const card = account({ id: 5, kind: "credit" });

    expect(accountBalances([card], [flow(5, "2026-02", { transferIn: 100 })]).get(5)).toMatchObject({ balance: 100, owed: 0 });
  });

  it("指定月份_只算到那個月底_起始餘額從建立的月份（台北時間）才算；建立前的月份一律是 0，建立前補記的舊紀錄從建立的月份起算", () => {
    // UTC 2/28 16:30 是台北 3/1 00:30
    const deposit = account({ id: 6, openingBalance: 1000, createdAt: new Date("2026-02-28T16:30:00Z") });
    const flows = [flow(6, "2026-02", { expense: 200 }), flow(6, "2026-04", { income: 500 })];

    expect(accountBalances([deposit], flows, "2026-01").get(6)?.balance).toBe(0);
    expect(accountBalances([deposit], flows, "2026-02").get(6)?.balance).toBe(0);
    expect(accountBalances([deposit], flows, "2026-03").get(6)?.balance).toBe(800);
    expect(accountBalances([deposit], flows, "2026-04").get(6)?.balance).toBe(1300);
    expect(accountBalances([deposit], flows).get(6)?.balance).toBe(1300);
  });

  it("10/14 建立、起始餘額 52,000 的帳戶有一筆 9/20 的舊紀錄（現在不能再記）_9 月的餘額與總資產是 0、不是負的；10 月起照算", () => {
    const cathay = account({ id: 41, name: "國泰", openingBalance: 52_000, createdAt: createdOn("2026-10-14") });
    const card = account({ id: 42, kind: "credit", openingBalance: -2000, createdAt: createdOn("2026-10-14") });
    const broker = account({ id: 43, kind: "investment", openingBalance: 80_000, openingCost: 75_000, createdAt: createdOn("2026-10-14") });
    const flows = [flow(41, "2026-09", { expense: 350, transferOut: 1000 }), flow(42, "2026-09", { expense: 1000 }), flow(43, "2026-09", { transferIn: 1000 })];
    const september = accountBalances([cathay, card, broker], flows, "2026-09");

    expect(september.get(41)).toEqual({ balance: 0, cost: null, profit: null, owed: null });
    expect(september.get(42)).toEqual({ balance: 0, cost: null, profit: null, owed: 0 });
    expect(september.get(43)).toEqual({ balance: 0, cost: 0, profit: 0, owed: null });
    expect(assetSummary([cathay, card, broker], september, "all")).toEqual({ assets: 0, owed: 0, investmentProfit: 0 });
    expect(negativeAccounts([cathay, card, broker], september, "all")).toEqual([]);

    const october = accountBalances([cathay, card, broker], flows, "2026-10");
    expect(october.get(41)?.balance).toBe(50_650);
    expect(october.get(42)).toMatchObject({ balance: -3000, owed: 3000 });
    expect(october.get(43)).toEqual({ balance: 81_000, cost: 76_000, profit: 5000, owed: null });
  });

  it("指定月份的投資成本_起始成本與轉入轉出也只算到那個月", () => {
    const investment = account({ id: 7, kind: "investment", openingBalance: 100, openingCost: 90, createdAt: createdOn("2026-03-01") });
    const flows = [flow(7, "2026-03", { transferIn: 10 }), flow(7, "2026-05", { transferIn: 1000 })];

    expect(accountBalances([investment], flows, "2026-02").get(7)).toEqual({ balance: 0, cost: 0, profit: 0, owed: null });
    expect(accountBalances([investment], flows, "2026-04").get(7)).toEqual({ balance: 110, cost: 100, profit: 10, owed: null });
  });

  it("每個帳戶都有一筆（沒有紀錄的是起始餘額）_清單外的帳戶的紀錄略過", () => {
    const balances = accountBalances([account({ id: 8, openingBalance: 300 }), account({ id: 9, active: false })], [flow(99, "2026-02", { income: 1 })]);

    expect([...balances.keys()]).toEqual([8, 9]);
    expect(balances.get(8)?.balance).toBe(300);
    expect(balances.get(9)?.balance).toBe(0);
  });
});

describe("assetSummary（總資產與信用卡未繳）", () => {
  it("只算啟用中的帳戶：資產是存款加投資（負的也算）_未繳是信用卡的合計_賺賠是投資的合計", () => {
    const accounts = [
      account({ id: 1 }),
      account({ id: 2, kind: "investment" }),
      account({ id: 3, active: false }),
      account({ id: 4, kind: "credit" }),
      account({ id: 5, kind: "credit", active: false }),
      account({ id: 6 }),
      account({ id: 7, kind: "investment", active: false }),
    ];
    const balances = new Map<number, AccountBalance>([
      [1, balanceOf(36_500)],
      [2, balanceOf(89_200, { cost: 80_000, profit: 9200 })],
      [3, balanceOf(5000)],
      [4, balanceOf(-1200, { owed: 1200 })],
      [5, balanceOf(-999, { owed: 999 })],
      [6, balanceOf(-300)],
      [7, balanceOf(1000, { cost: 500, profit: 500 })],
    ]);

    expect(assetSummary(accounts, balances)).toEqual({ assets: 125_400, owed: 1200, investmentProfit: 9200 });
    expect(assetSummary(accounts, balances, "active")).toEqual({ assets: 125_400, owed: 1200, investmentProfit: 9200 });
  });

  it("all（過去的月份）_停用的帳戶也算：那時候錢還在", () => {
    const accounts = [
      account({ id: 1 }),
      account({ id: 2, kind: "investment", active: false }),
      account({ id: 3, active: false }),
      account({ id: 4, kind: "credit", active: false }),
    ];
    const balances = new Map<number, AccountBalance>([
      [1, balanceOf(1000)],
      [2, balanceOf(2000, { cost: 1500, profit: 500 })],
      [3, balanceOf(300)],
      [4, balanceOf(-700, { owed: 700 })],
    ]);

    expect(assetSummary(accounts, balances, "all")).toEqual({ assets: 3300, owed: 700, investmentProfit: 500 });
    expect(assetSummary(accounts, balances)).toEqual({ assets: 1000, owed: 0, investmentProfit: 0 });
  });

  it("什麼都沒有_全部是 0", () => {
    expect(assetSummary([], new Map())).toEqual({ assets: 0, owed: 0, investmentProfit: 0 });
  });
});

describe("negativeAccounts（餘額是負的存款與投資：資產圓餅圖只畫正的，負的另外寫出來）", () => {
  const accounts = [
    account({ id: 1, name: "透支", sortOrder: 2 }),
    account({ id: 2, name: "國泰", sortOrder: 0 }),
    account({ id: 3, name: "證券", kind: "investment", sortOrder: 1 }),
    account({ id: 4, name: "信用卡", kind: "credit", sortOrder: 3 }),
    account({ id: 5, name: "舊帳戶", active: false, sortOrder: 4 }),
    account({ id: 6, name: "剛好 0", sortOrder: 5 }),
  ];
  const balances = balancesOf([
    [1, -300],
    [2, 5000],
    [3, -20],
    [4, -999],
    [5, -50],
    [6, 0],
  ]);

  it("只列啟用中、餘額小於 0 的存款與投資_照帳戶的順序_信用卡的欠款不算", () => {
    expect(negativeAccounts(accounts, balances)).toEqual([
      { accountId: 3, name: "證券", balance: -20 },
      { accountId: 1, name: "透支", balance: -300 },
    ]);
  });

  it("all（過去的月份）_停用的也列出", () => {
    expect(negativeAccounts(accounts, balances, "all").map((row) => row.accountId)).toEqual([3, 1, 5]);
  });

  it("沒有負的_空清單；餘額不在清單裡的帳戶當成 0", () => {
    expect(negativeAccounts([account({ id: 7 })], new Map())).toEqual([]);
  });
});

const totals: CategoryMonthTotal[] = [
  { categoryId: 1, kind: "income", month: "2026-10", amount: 43_000 },
  { categoryId: null, kind: "income", month: "2026-10", amount: 500 },
  { categoryId: 2, kind: "expense", month: "2026-10", amount: 1200 },
  { categoryId: 3, kind: "expense", month: "2026-10", amount: 300 },
  { categoryId: null, kind: "expense", month: "2026-10", amount: 300 },
  { categoryId: 99, kind: "expense", month: "2026-10", amount: 200 },
  { categoryId: 2, kind: "expense", month: "2026-09", amount: 999 },
];

describe("monthTotals（本月收入、支出、存下）", () => {
  it("只算那個月_含未分類_存下是收入減支出", () => {
    expect(monthTotals(totals, "2026-10")).toEqual({ income: 43_500, expense: 2000, saved: 41_500 });
  });

  it("支出比收入多_存下是負的", () => {
    expect(monthTotals(totals, "2026-09")).toEqual({ income: 0, expense: 999, saved: -999 });
  });

  it("沒有紀錄的月份_都是 0", () => {
    expect(monthTotals(totals, "2026-01")).toEqual({ income: 0, expense: 0, saved: 0 });
  });
});

const categories: CategoryLike[] = [
  { id: 1, name: "薪水", kind: "income", color: "green", monthlyBudget: null },
  { id: 2, name: "餐飲", kind: "expense", color: "orange", monthlyBudget: 6000 },
  { id: 3, name: "交通", kind: "expense", color: "blue", monthlyBudget: 2000 },
  { id: 4, name: "訂閱", kind: "expense", color: "violet", monthlyBudget: 500 },
];

describe("expenseSlices（支出圓餅圖）", () => {
  it("由大到小_未分類與找不到的分類合成灰色的「未分類」_沒花錢的分類不列_收入不算", () => {
    expect(expenseSlices(categories, totals, "2026-10")).toEqual([
      { key: "category:2", label: "餐飲", color: "orange", amount: 1200, percent: 60 },
      { key: "uncategorized", label: "未分類", color: "slate", amount: 500, percent: 25 },
      { key: "category:3", label: "交通", color: "blue", amount: 300, percent: 15 },
    ]);
  });

  it("金額一樣時照分類的順序_未分類排最後_百分比到小數一位、合計剛好 100（多的 0.1 給前面的）", () => {
    const tied: CategoryMonthTotal[] = [
      { categoryId: null, kind: "expense", month: "2026-10", amount: 100 },
      { categoryId: 3, kind: "expense", month: "2026-10", amount: 100 },
      { categoryId: 2, kind: "expense", month: "2026-10", amount: 100 },
    ];

    const slices = expenseSlices(categories, tied, "2026-10");

    expect(slices.map((s) => [s.key, s.percent])).toEqual([
      ["category:2", 33.4],
      ["category:3", 33.3],
      ["uncategorized", 33.3],
    ]);
    expect(tenthsTotal(slices)).toBe(1000);
  });

  it("六片一樣大_四捨五入會合計 100.2，改成依餘數分配：合計剛好 100", () => {
    const six: CategoryLike[] = Array.from({ length: 6 }, (_, i) => ({ id: 10 + i, name: `分類${i}`, kind: "expense", color: "blue", monthlyBudget: null }));
    const even: CategoryMonthTotal[] = six.map((category) => ({ categoryId: category.id, kind: "expense", month: "2026-10", amount: 50 }));

    const slices = expenseSlices(six, even, "2026-10");

    expect(slices.map((s) => s.percent)).toEqual([16.7, 16.7, 16.7, 16.7, 16.6, 16.6]);
    expect(tenthsTotal(slices)).toBe(1000);
  });

  it("餘數大的先拿到多的 0.1（不是照順序）", () => {
    const three: CategoryMonthTotal[] = [
      { categoryId: 2, kind: "expense", month: "2026-10", amount: 1006 },
      { categoryId: 3, kind: "expense", month: "2026-10", amount: 1004 },
      { categoryId: 4, kind: "expense", month: "2026-10", amount: 990 },
    ];

    // 約 33.53 33.47 33.0 捨去後 33.5 + 33.4 + 33.0 = 99.9
    // 多的 0.1 給餘數最大的 33.47 那片
    expect(expenseSlices(categories, three, "2026-10").map((s) => s.percent)).toEqual([33.5, 33.5, 33]);
  });

  it("那個月沒有支出_沒有任何一片", () => {
    expect(expenseSlices(categories, totals, "2026-01")).toEqual([]);
  });
});

describe("assetSlices（資產圓餅圖）", () => {
  const purposes: PurposeLike[] = [
    { id: 1, name: "生活費", color: "blue" },
    { id: 2, name: "緊急預備金", color: "amber" },
    { id: 3, name: "投資", color: "violet" },
    { id: 4, name: "旅遊", color: "teal" },
  ];
  const accounts = [
    account({ id: 11, name: "國泰", purposeId: 1, sortOrder: 0 }),
    account({ id: 12, name: "郵局", purposeId: 2, sortOrder: 1 }),
    account({ id: 13, name: "證券", kind: "investment", purposeId: 3, sortOrder: 2 }),
    account({ id: 14, name: "零錢", purposeId: null, sortOrder: 3 }),
    account({ id: 15, name: "台新", purposeId: 1, sortOrder: 4 }),
    account({ id: 16, name: "信用卡", kind: "credit", purposeId: 1, sortOrder: 5 }),
    account({ id: 17, name: "舊帳戶", purposeId: 2, active: false, sortOrder: 6 }),
    account({ id: 18, name: "外幣", purposeId: 99, sortOrder: 7 }),
    account({ id: 19, name: "透支", purposeId: 1, sortOrder: 8 }),
  ];
  const balances = balancesOf([
    [11, 30_000],
    [12, 50_000],
    [13, 20_000],
    [14, 0],
    [15, 10_000],
    [16, 5000],
    [17, 7000],
    [18, 5000],
    [19, -100],
  ]);

  it("依用途_照用途的順序、同用途加總_沒設定或找不到用途的是灰色的「未設定用途」排最後_只算啟用中、餘額大於 0 的存款與投資", () => {
    expect(assetSlices("purpose", accounts, purposes, balances)).toEqual([
      { key: "purpose:1", label: "生活費", color: "blue", amount: 40_000, percent: 34.8 },
      { key: "purpose:2", label: "緊急預備金", color: "amber", amount: 50_000, percent: 43.5 },
      { key: "purpose:3", label: "投資", color: "violet", amount: 20_000, percent: 17.4 },
      { key: "purpose:none", label: "未設定用途", color: "slate", amount: 5000, percent: 4.3 },
    ]);
  });

  it("依帳戶_照帳戶的順序_顏色輪替可以選的顏色，用途沒用到的顏色先用（切換分組時不會跟用途的顏色搞混）", () => {
    // 用途用了藍 黃 紫 青 先輪沒用到的綠 橘 紅 再照色盤的順序輪用到的
    expect(assetSlices("account", accounts, purposes, balances)).toEqual([
      { key: "account:11", label: "國泰", color: "green", amount: 30_000, percent: 26.1 },
      { key: "account:12", label: "郵局", color: "orange", amount: 50_000, percent: 43.5 },
      { key: "account:13", label: "證券", color: "rose", amount: 20_000, percent: 17.4 },
      { key: "account:15", label: "台新", color: "blue", amount: 10_000, percent: 8.7 },
      { key: "account:18", label: "外幣", color: "teal", amount: 5000, percent: 4.3 },
    ]);
  });

  it("帳戶比可以選的 7 種顏色還多_從頭輪替；灰色留給「未設定用途」，依帳戶時不用", () => {
    const many = Array.from({ length: 9 }, (_, i) => account({ id: 100 + i, sortOrder: i }));
    const slices = assetSlices("account", many, [], balancesOf(many.map((a) => [a.id, 100])));

    expect(slices.map((s) => s.color)).toEqual(["blue", "teal", "green", "amber", "orange", "rose", "violet", "blue", "teal"]);
  });

  it("傳進來的順序不對_仍照設定的順序排", () => {
    const shuffled = [account({ id: 31, sortOrder: 2 }), account({ id: 32, sortOrder: 0 }), account({ id: 33, sortOrder: 1 })];

    expect(assetSlices("account", shuffled, [], balancesOf([[31, 1], [32, 1], [33, 1]])).map((s) => s.key)).toEqual(["account:32", "account:33", "account:31"]);
  });

  it("沒有資產_沒有任何一片", () => {
    expect(assetSlices("purpose", [account({ id: 41 })], purposes, balancesOf([[41, 0]]))).toEqual([]);
  });

  it("三個一樣大的帳戶_百分比合計剛好 100（33.4＋33.3＋33.3）", () => {
    const three = [account({ id: 51, sortOrder: 0 }), account({ id: 52, sortOrder: 1 }), account({ id: 53, sortOrder: 2 })];
    const slices = assetSlices("account", three, [], balancesOf(three.map((a) => [a.id, 1000])));

    expect(slices.map((s) => s.percent)).toEqual([33.4, 33.3, 33.3]);
    expect(tenthsTotal(slices)).toBe(1000);
  });

  it("六個用途一樣大_百分比合計剛好 100", () => {
    const six: PurposeLike[] = Array.from({ length: 6 }, (_, i) => ({ id: 60 + i, name: `用途${i}`, color: "blue" }));
    const holders = six.map((purpose, i) => account({ id: 70 + i, purposeId: purpose.id, sortOrder: i }));
    const slices = assetSlices("purpose", holders, six, balancesOf(holders.map((a) => [a.id, 700])));

    expect(slices.map((s) => s.percent)).toEqual([16.7, 16.7, 16.7, 16.7, 16.6, 16.6]);
    expect(tenthsTotal(slices)).toBe(1000);
  });

  it("all（過去的月份）_停用的帳戶也畫進去；預設只畫啟用中的", () => {
    const withClosed = [account({ id: 81, name: "國泰", sortOrder: 0 }), account({ id: 82, name: "舊帳戶", active: false, sortOrder: 1 })];
    const balances = balancesOf([
      [81, 300],
      [82, 100],
    ]);

    expect(assetSlices("account", withClosed, [], balances, "all").map((s) => [s.label, s.amount, s.percent])).toEqual([
      ["國泰", 300, 75],
      ["舊帳戶", 100, 25],
    ]);
    expect(assetSlices("account", withClosed, [], balances).map((s) => s.label)).toEqual(["國泰"]);
  });
});

describe("budgetRows（每月預算）", () => {
  const budgeted: CategoryLike[] = [
    ...categories,
    { id: 5, name: "娛樂", kind: "expense", color: "rose", monthlyBudget: null },
    { id: 6, name: "保險", kind: "expense", color: "teal", monthlyBudget: 3000 },
  ];
  const spent: CategoryMonthTotal[] = [
    { categoryId: 2, kind: "expense", month: "2026-10", amount: 4500 },
    { categoryId: 3, kind: "expense", month: "2026-10", amount: 1600 },
    { categoryId: 4, kind: "expense", month: "2026-10", amount: 600 },
    { categoryId: 5, kind: "expense", month: "2026-10", amount: 300 },
    { categoryId: 2, kind: "expense", month: "2026-09", amount: 99_999 },
  ];

  it("只列有預算的支出分類_照分類的順序_80% 起是 warning、超過是 over_還剩可以是負的", () => {
    expect(budgetRows(budgeted, spent, "2026-10")).toEqual([
      { categoryId: 2, name: "餐飲", color: "orange", budget: 6000, spent: 4500, remaining: 1500, percent: 75, status: "ok" },
      { categoryId: 3, name: "交通", color: "blue", budget: 2000, spent: 1600, remaining: 400, percent: 80, status: "warning" },
      { categoryId: 4, name: "訂閱", color: "violet", budget: 500, spent: 600, remaining: -100, percent: 120, status: "over" },
      { categoryId: 6, name: "保險", color: "teal", budget: 3000, spent: 0, remaining: 3000, percent: 0, status: "ok" },
    ]);
  });

  it("剛好花完是 warning_多 1 元才是 over", () => {
    const one: CategoryLike[] = [{ id: 7, name: "書", kind: "expense", color: "blue", monthlyBudget: 1000 }];
    const at = (amount: number) => budgetRows(one, [{ categoryId: 7, kind: "expense", month: "2026-10", amount }], "2026-10")[0];

    expect(at(1000)).toMatchObject({ percent: 100, status: "warning" });
    expect(at(1001)).toMatchObject({ percent: 100.1, status: "over" });
  });

  it("還沒到 80% 的百分比不會進位成 80（顯示的數字跟顏色一致）", () => {
    const one: CategoryLike[] = [{ id: 8, name: "書", kind: "expense", color: "blue", monthlyBudget: 10_000 }];

    expect(budgetRows(one, [{ categoryId: 8, kind: "expense", month: "2026-10", amount: 7999 }], "2026-10")[0]).toMatchObject({ percent: 79.9, status: "ok" });
  });
});

describe("trendSeries（最近 12 個月的收入、支出與總資產）", () => {
  const accounts = [
    account({ id: 1, openingBalance: 10_000, createdAt: createdOn("2026-03-05") }),
    account({ id: 2, kind: "investment", openingBalance: 50_000, createdAt: createdOn("2026-05-10") }),
    account({ id: 3, kind: "credit", openingBalance: -2000, createdAt: createdOn("2026-03-05") }),
    account({ id: 4, openingBalance: 7000, active: false, createdAt: createdOn("2026-03-05") }),
  ];
  const flows = [
    flow(1, "2026-03", { income: 40_000, expense: 5000 }),
    flow(3, "2026-04", { expense: 1000 }),
    flow(1, "2026-05", { transferOut: 10_000 }),
    flow(2, "2026-05", { transferIn: 10_000 }),
  ];
  const monthly: CategoryMonthTotal[] = [
    { categoryId: 1, kind: "income", month: "2026-03", amount: 40_000 },
    { categoryId: 2, kind: "expense", month: "2026-03", amount: 5000 },
    { categoryId: null, kind: "expense", month: "2026-04", amount: 1000 },
  ];

  it("從最早有資料的月份開始_資產是每個月底的存款與投資（過去的月份連停用的帳戶也算，本月只算啟用中的）_還沒建立的帳戶不算起始餘額", () => {
    expect(trendSeries(accounts, flows, monthly, "2026-06")).toEqual([
      { month: "2026-03", income: 40_000, expense: 5000, assets: 52_000 },
      { month: "2026-04", income: 0, expense: 1000, assets: 52_000 },
      { month: "2026-05", income: 0, expense: 0, assets: 102_000 },
      { month: "2026-06", income: 0, expense: 0, assets: 95_000 },
    ]);
  });

  it("資料超過 12 個月_只取到 end 為止的最近 12 個月", () => {
    const series = trendSeries(accounts, flows, monthly, "2027-12");

    expect(series.map((p) => p.month)).toEqual(["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10", "2027-11", "2027-12"]);
    expect(series.slice(0, -1).every((p) => p.assets === 102_000)).toBe(true);
    expect(series.at(-1)?.assets).toBe(95_000);
  });

  it("帳戶的錢在 5 月轉走、6 月停用_每個月的資產都一樣（停用前的月份照算，不會像突然多出一筆錢）", () => {
    const old = account({ id: 31, name: "舊帳戶", openingBalance: 100_000, active: false, createdAt: createdOn("2026-01-10") });
    const kept = account({ id: 32, name: "郵局", createdAt: createdOn("2026-01-10") });
    const moved = [flow(31, "2026-05", { transferOut: 100_000 }), flow(32, "2026-05", { transferIn: 100_000 })];

    expect(trendSeries([old, kept], moved, [], "2026-06").map((p) => [p.month, p.assets])).toEqual([
      ["2026-01", 100_000],
      ["2026-02", 100_000],
      ["2026-03", 100_000],
      ["2026-04", 100_000],
      ["2026-05", 100_000],
      ["2026-06", 100_000],
    ]);
  });

  it("current 是這個月：看過去的月份時，end 之前與 end 都是過去，全部連停用的也算；current 之後（含）只算啟用中的", () => {
    expect(trendSeries(accounts, flows, monthly, "2026-05", 12, "2026-10").map((p) => p.assets)).toEqual([52_000, 52_000, 102_000]);
    expect(trendSeries(accounts, flows, monthly, "2026-06", 12, "2026-05").map((p) => p.assets)).toEqual([52_000, 52_000, 95_000, 95_000]);
  });

  it("可以指定月數", () => {
    expect(trendSeries(accounts, flows, monthly, "2026-06", 2).map((p) => p.month)).toEqual(["2026-05", "2026-06"]);
  });

  it("紀錄比帳戶建立還早（現在不能再記的舊資料）_從最早的紀錄開始，建立前的月份資產是 0、不會是負的", () => {
    const backdated = [flow(1, "2026-01", { expense: 100 })];

    expect(trendSeries([accounts[0]], backdated, [], "2026-03")).toEqual([
      { month: "2026-01", income: 0, expense: 0, assets: 0 },
      { month: "2026-02", income: 0, expense: 0, assets: 0 },
      { month: "2026-03", income: 0, expense: 0, assets: 9900 },
    ]);
  });

  it("10/14 建立、起始餘額 52,000 的帳戶有一筆 9/20 的支出（舊資料）_9 月照樣算進支出，總資產是 0 不是 -350", () => {
    const cathay = account({ id: 41, openingBalance: 52_000, createdAt: createdOn("2026-10-14") });
    const expense: CategoryMonthTotal[] = [{ categoryId: null, kind: "expense", month: "2026-09", amount: 350 }];

    expect(trendSeries([cathay], [flow(41, "2026-09", { expense: 350 })], expense, "2026-10")).toEqual([
      { month: "2026-09", income: 0, expense: 350, assets: 0 },
      { month: "2026-10", income: 0, expense: 0, assets: 51_650 },
    ]);
  });

  it("看的月份比所有資料都早、或什麼都沒有_是空的", () => {
    expect(trendSeries(accounts, flows, monthly, "2026-02")).toEqual([]);
    expect(trendSeries([], [], [], "2026-10")).toEqual([]);
  });
});

describe("targetProgress（目標金額）", () => {
  it("沒設目標_null", () => {
    expect(targetProgress(null, 5000)).toBeNull();
  });

  it("存到一部分", () => {
    expect(targetProgress(100_000, 25_000)).toEqual({ target: 100_000, balance: 25_000, remaining: 75_000, percent: 25, reached: false });
  });

  it("剛好達標或超過_還差 0、100%", () => {
    expect(targetProgress(100_000, 100_000)).toEqual({ target: 100_000, balance: 100_000, remaining: 0, percent: 100, reached: true });
    expect(targetProgress(100_000, 130_000)).toEqual({ target: 100_000, balance: 130_000, remaining: 0, percent: 100, reached: true });
  });

  it("差一點點_不會顯示成 100%", () => {
    expect(targetProgress(100_000, 99_999)).toMatchObject({ percent: 99.9, reached: false, remaining: 1 });
  });

  it("餘額是負的_0%、還差目標加上負的部分", () => {
    expect(targetProgress(1000, -500)).toEqual({ target: 1000, balance: -500, remaining: 1500, percent: 0, reached: false });
  });
});

describe("creditCardStatuses（信用卡）", () => {
  const accounts = [
    account({ id: 1, name: "國泰", sortOrder: 0 }),
    account({ id: 2, kind: "credit", dueDay: 6, payFromAccountId: 1, sortOrder: 2 }),
    account({ id: 3, kind: "credit", dueDay: 25, payFromAccountId: 1, sortOrder: 1 }),
    account({ id: 4, kind: "credit", sortOrder: 3 }),
    account({ id: 5, kind: "credit", payFromAccountId: 1, active: false, sortOrder: 4 }),
  ];
  const balances = new Map<number, AccountBalance>([
    [1, balanceOf(5000)],
    [2, balanceOf(-3000, { owed: 3000 })],
    [3, balanceOf(-2500, { owed: 2500 })],
    [4, balanceOf(100, { owed: 0 })],
    [5, balanceOf(-999, { owed: 999 })],
  ]);

  it("啟用中的卡照順序_下次繳款日_扣款帳戶繳完所有從它扣款的卡後還剩多少_不夠就是 short", () => {
    expect(creditCardStatuses(accounts, balances, "2026-10-14")).toEqual([
      { accountId: 3, owed: 2500, dueDay: 25, nextDueDate: "2026-10-25", payFromAccountId: 1, payFromRemaining: -500, short: true },
      { accountId: 2, owed: 3000, dueDay: 6, nextDueDate: "2026-11-06", payFromAccountId: 1, payFromRemaining: -500, short: true },
      { accountId: 4, owed: 0, dueDay: null, nextDueDate: null, payFromAccountId: null, payFromRemaining: null, short: false },
    ]);
  });

  it("扣款帳戶夠扣_不是 short", () => {
    const enough = new Map(balances).set(1, balanceOf(10_000));

    expect(creditCardStatuses(accounts, enough, "2026-10-14")[0]).toMatchObject({ payFromRemaining: 4500, short: false });
  });

  it("今天就是繳款日_下次繳款日是今天", () => {
    expect(creditCardStatuses(accounts, balances, "2026-10-06").find((s) => s.accountId === 2)?.nextDueDate).toBe("2026-10-06");
  });

  it("繳款日是 31 日_小月與 2 月算月底", () => {
    const card = account({ id: 6, kind: "credit", dueDay: 31 });
    const of = (today: string) => creditCardStatuses([card], new Map([[6, balanceOf(0, { owed: 0 })]]), today)[0].nextDueDate;

    expect(of("2026-11-14")).toBe("2026-11-30");
    expect(of("2026-12-31")).toBe("2026-12-31");
    expect(of("2027-02-01")).toBe("2027-02-28");
    expect(of("2028-02-01")).toBe("2028-02-29");
  });

  it("繳款日過了_下個月；跨年也對", () => {
    const card = account({ id: 7, kind: "credit", dueDay: 10 });

    expect(creditCardStatuses([card], new Map(), "2026-12-11")[0]).toMatchObject({ owed: 0, nextDueDate: "2027-01-10" });
  });

  it("停用的卡還有未繳_不列出，也不算進扣款帳戶要繳的（停用的帳戶不算進總覽）", () => {
    const deposit = account({ id: 11, sortOrder: 0 });
    const closedCard = account({ id: 12, kind: "credit", dueDay: 6, payFromAccountId: 11, active: false, sortOrder: 1 });
    const card = account({ id: 13, kind: "credit", dueDay: 6, payFromAccountId: 11, sortOrder: 2 });
    const owing = new Map<number, AccountBalance>([
      [11, balanceOf(1000)],
      [12, balanceOf(-5000, { owed: 5000 })],
      [13, balanceOf(-600, { owed: 600 })],
    ]);

    expect(creditCardStatuses([deposit, closedCard, card], owing, "2026-10-14")).toEqual([
      { accountId: 13, owed: 600, dueDay: 6, nextDueDate: "2026-11-06", payFromAccountId: 11, payFromRemaining: 400, short: false },
    ]);
  });

  it("扣款帳戶不在餘額清單裡_繳完剩多少是 null、不算不夠扣；卡自己的未繳照算", () => {
    const card = account({ id: 14, kind: "credit", dueDay: 6, payFromAccountId: 99 });

    expect(creditCardStatuses([card], new Map([[14, balanceOf(-800, { owed: 800 })]]), "2026-10-14")).toEqual([
      { accountId: 14, owed: 800, dueDay: 6, nextDueDate: "2026-11-06", payFromAccountId: 99, payFromRemaining: null, short: false },
    ]);
  });

  it("溢繳的卡（餘額是正的）_未繳是 0，不會讓扣款帳戶多出錢", () => {
    const deposit = account({ id: 15 });
    const overpaid = account({ id: 16, kind: "credit", payFromAccountId: 15 });

    expect(creditCardStatuses([deposit, overpaid], balancesOf([[15, 1000], [16, 300]]), "2026-10-14")[0]).toMatchObject({ owed: 0, payFromRemaining: 1000, short: false });
  });
});

describe("suggestAllocation（發薪分配的建議）", () => {
  const accounts = [
    account({ id: 1, name: "入帳", monthlyPlan: 5000, sortOrder: 0 }),
    account({ id: 2, monthlyPlan: 10_000, sortOrder: 1 }),
    account({ id: 3, monthlyPlan: 8000, targetAmount: 100_000, sortOrder: 2 }),
    account({ id: 4, kind: "investment", monthlyPlan: 3000, targetAmount: 50_000, sortOrder: 3 }),
    account({ id: 5, sortOrder: 4 }),
    account({ id: 6, kind: "credit", monthlyPlan: 500, sortOrder: 5 }),
    account({ id: 7, monthlyPlan: 1000, active: false, sortOrder: 6 }),
    account({ id: 8, monthlyPlan: 2000, targetAmount: 10_000, sortOrder: 7 }),
    account({ id: 9, monthlyPlan: 2000, targetAmount: 10_000, sortOrder: 8 }),
  ];
  const balances = balancesOf([
    [1, 0],
    [2, 0],
    [3, 95_000],
    [4, 60_000],
    [8, 9000],
    [9, 8000],
  ]);

  it("啟用中、不是信用卡也不是入帳帳戶、有每月規劃的帳戶照順序_有目標的最多分到目標_到了是 0_剩下的留在入帳帳戶", () => {
    expect(suggestAllocation(accounts, balances, 1, 43_000)).toEqual({
      lines: [
        { accountId: 2, suggested: 10_000, reason: "plan" },
        { accountId: 3, suggested: 5000, reason: "target-capped" },
        { accountId: 4, suggested: 0, reason: "target-reached" },
        { accountId: 8, suggested: 1000, reason: "target-capped" },
        { accountId: 9, suggested: 2000, reason: "plan" },
      ],
      remainder: 25_000,
    });
  });

  it("換一個入帳帳戶_原本的入帳帳戶也可以分到", () => {
    expect(suggestAllocation(accounts, balances, 2, 43_000).lines.map((line) => line.accountId)).toEqual([1, 3, 4, 8, 9]);
  });

  it("薪水不夠分_剩下的是負的", () => {
    expect(suggestAllocation(accounts, balances, 1, 10_000).remainder).toBe(-8000);
  });

  it("傳進來的順序不對_仍照設定的順序", () => {
    const shuffled = [account({ id: 21, monthlyPlan: 1, sortOrder: 2 }), account({ id: 22, monthlyPlan: 1, sortOrder: 0 })];

    expect(suggestAllocation(shuffled, new Map(), 99, 10).lines.map((line) => line.accountId)).toEqual([22, 21]);
  });

  it("只需要分配用得到的欄位（瀏覽器的選項不必湊齊整個帳戶）", () => {
    const options: AllocationAccount[] = [
      { id: 31, kind: "deposit", active: true, monthlyPlan: 3000, targetAmount: 10_000, sortOrder: 0 },
      { id: 32, kind: "investment", active: true, monthlyPlan: 2000, targetAmount: null, sortOrder: 1 },
    ];

    expect(suggestAllocation(options, balancesOf([[31, 8000]]), 1, 43_000)).toEqual({
      lines: [
        { accountId: 31, suggested: 2000, reason: "target-capped" },
        { accountId: 32, suggested: 2000, reason: "plan" },
      ],
      remainder: 39_000,
    });
  });
});

describe("earliestFlowMonth（月份選單最早的月份）", () => {
  it("最早有紀錄的月份", () => {
    expect(earliestFlowMonth([flow(1, "2026-05", {}), flow(2, "2026-03", {}), flow(1, "2026-04", {})])).toBe("2026-03");
  });

  it("沒有紀錄_null", () => {
    expect(earliestFlowMonth([])).toBeNull();
  });
});
