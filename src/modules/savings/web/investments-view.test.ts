import { describe, expect, it } from "vitest";
import { accountRow, flowRow } from "../dev/fixtures";
import { investmentsView, type InvestmentsSources } from "./investments-view";

const TODAY = "2026-10-16";
const CREATED = new Date("2026-08-01T02:00:00Z");

const account = (id: number, name: string, kind: "deposit" | "investment" | "credit", fields: Partial<ReturnType<typeof accountRow>> = {}) => accountRow({ id, name, kind, createdAt: CREATED, ...fields });
const ACCOUNTS = [
  account(1, "台銀", "deposit", { openingBalance: 50000 }),
  account(6, "臺銀證券", "investment", { label: "長期投資" }),
  // 沒有持股 市值照更新的數字
  account(8, "元大證券", "investment", { openingBalance: 20000, openingCost: 18000 }),
  account(9, "舊證券", "investment", { active: false }),
];
const HOLDINGS = [
  { id: 50, accountId: 6, symbol: "006208", name: "富邦台灣50", shares: 238, cost: 24000, sortOrder: 0 },
  { id: 51, accountId: 6, symbol: "0050", name: "元大台灣50", shares: 100, cost: 15000, sortOrder: 1 },
  { id: 52, accountId: 9, symbol: "2330", name: "台積電", shares: 1, cost: 1000, sortOrder: 0 },
];
const QUOTES = [
  { symbol: "006208", name: "富邦台灣50", closeCents: 10650, date: "2026-10-15", market: "twse" as const },
  { symbol: "0050", name: "元大台灣50", closeCents: 19500, date: "2026-10-14", market: "twse" as const },
];
const FLOWS = [flowRow(6, "2026-10", { transferIn: 39000 })];
const RULES = [{ accountId: 1, counterAccountId: 6, holdingId: 50 }];
const SOURCES: InvestmentsSources = { accounts: ACCOUNTS, flows: FLOWS, holdings: HOLDINGS, quotes: QUOTES, rules: RULES, today: TODAY };

describe("投資頁", () => {
  it("每個啟用中的證券帳戶一區；有持股的市值照收盤價、照市值由大到小排", () => {
    const { brokerages } = investmentsView(SOURCES);
    const [taiwan, yuanta] = brokerages;

    expect(brokerages.map((item) => item.id)).toEqual([6, 8]);
    // 238 股乘 106.50 元是 25347 100 股乘 195 元是 19500
    expect(taiwan.holdings.map((holding) => [holding.symbol, holding.value, holding.profit])).toEqual([
      ["006208", 25347, 1347],
      ["0050", 19500, 4500],
    ]);
    expect(taiwan).toMatchObject({ label: "長期投資", value: 44847, cost: 39000, profit: 5847, priced: true, quoteDate: "2026-10-15" });
    // 沒有持股 市值是帳上的 20000 成本 18000
    expect(yuanta).toMatchObject({ value: 20000, cost: 18000, profit: 2000, holdings: [] });
  });

  it("買賣預設用定期定額扣款的存款帳戶", () => {
    const [taiwan] = investmentsView(SOURCES).brokerages;

    expect(taiwan.holdings.map((holding) => [holding.symbol, holding.settlementAccountId])).toEqual([
      ["006208", 1],
      ["0050", null],
    ]);
  });

  it("摘要：啟用中的證券帳戶合計，損益百分比相對成本、到小數一位；最新的收盤日", () => {
    // 市值 44847 加 20000 成本 39000 加 18000 損益 7847 是成本的 13.77%
    expect(investmentsView(SOURCES).summary).toEqual({ value: 64847, cost: 57000, profit: 7847, profitPercent: 13.8, priced: true, quoteDate: "2026-10-15", accounts: 2 });
  });

  it("股價讀不到：摘要與帳戶都標出來（市值先用成本）", () => {
    const view = investmentsView({ ...SOURCES, quotes: null });

    expect(view.summary.priced).toBe(false);
    expect(view.brokerages[0]).toMatchObject({ priced: false, value: 39000 });
  });

  it("停用的證券帳戶不在這頁（在帳戶頁的已停用），只算有幾個", () => {
    expect(investmentsView(SOURCES).pausedCount).toBe(1);
  });

  it("刪除前要說的：持股與定期定額會一起刪，有沒有紀錄與轉帳", () => {
    const [taiwan, yuanta] = investmentsView(SOURCES).brokerages;

    expect(taiwan.usage).toEqual({ recurringCount: 1, hasRecords: true, hasTransfers: true, holdingCount: 2 });
    expect(yuanta.usage).toEqual({ recurringCount: 0, hasRecords: false, hasTransfers: false, holdingCount: 0 });
  });

  it("上移下移只在啟用中的證券帳戶之間（停用的不參與）；修改視窗帶入的內容不含 userId", () => {
    const [taiwan, yuanta] = investmentsView(SOURCES).brokerages;

    expect([taiwan.isFirst, taiwan.isLast, yuanta.isFirst, yuanta.isLast]).toEqual([true, false, false, true]);
    expect(taiwan.draft).toMatchObject({ id: 6, kind: "investment", label: "長期投資" });
    expect(taiwan.draft).not.toHaveProperty("userId");
  });
});
