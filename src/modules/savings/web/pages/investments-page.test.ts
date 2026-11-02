import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { markup, mocksOf } from "@/dev/test-helpers";
import { accountRow } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/savings/investments" }));
vi.mock("../../service/cached", { spy: true });
// 換成只記下收到什麼的替身 這裡只看頁面讀了誰的資料與網址參數
vi.mock("../components/investments/brokerage-list", () => ({ BrokerageList: vi.fn(() => null) }));
vi.mock("../components/recurring/regular-buy-list", () => ({ RegularBuyList: vi.fn(() => null) }));
vi.mock("../components/investments/dividends-card", () => ({ DividendsCard: vi.fn(() => null) }));

vi.useFakeTimers({ now: new Date("2026-10-16T04:00:00Z"), toFake: ["Date"] });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedAccountFlows", "cachedHoldings", "cachedRecurring", "cachedCategories", "cachedQuotes", "cachedDividends");
const { BrokerageList } = await import("../components/investments/brokerage-list");
const { RegularBuyList } = await import("../components/recurring/regular-buy-list");
const { DividendsCard } = await import("../components/investments/dividends-card");
const { InvestmentsSection } = await import("./investments-page");

const CREATED = new Date("2026-08-01T02:00:00Z");
const ACCOUNTS = [accountRow({ id: 1, name: "台銀", kind: "deposit" }), accountRow({ id: 9, name: "舊帳戶", kind: "deposit", active: false }), accountRow({ id: 6, name: "臺銀證券", kind: "investment" })];
const HOLDINGS = [
  { id: 50, userId: "u", accountId: 6, symbol: "006208", name: "富邦台灣50", shares: 238, cost: 24000, sortOrder: 0, createdAt: CREATED },
  { id: 51, userId: "u", accountId: 6, symbol: "0050", name: "元大台灣50", shares: 100, cost: 15000, sortOrder: 1, createdAt: CREATED },
];

const visit = async (search: Record<string, string | string[] | undefined> = {}) => markup(await InvestmentsSection({ searchParams: Promise.resolve(search) }));
const listProps = () => vi.mocked(BrokerageList).mock.calls[0][0];

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(ACCOUNTS);
  cached.cachedAccountFlows.mockReset().mockResolvedValue([]);
  cached.cachedHoldings.mockReset().mockResolvedValue(HOLDINGS);
  cached.cachedRecurring.mockReset().mockResolvedValue([]);
  cached.cachedCategories.mockReset().mockResolvedValue([]);
  cached.cachedQuotes.mockReset().mockResolvedValue([]);
  cached.cachedDividends.mockReset().mockResolvedValue([]);
  vi.mocked(BrokerageList).mockClear();
  vi.mocked(RegularBuyList).mockClear();
  vi.mocked(DividendsCard).mockClear();
});

describe("投資頁", () => {
  it("用登入者（bob）的 id 讀資料", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await visit();

    for (const read of ["cachedAccounts", "cachedAccountFlows", "cachedHoldings", "cachedRecurring", "cachedCategories"] as const) expect(cached[read]).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("股價只查持股的代號（排序去重）；沒有持股時不查", async () => {
    await visit();
    expect(cached.cachedQuotes).toHaveBeenCalledWith(["0050", "006208"]);

    cached.cachedQuotes.mockClear();
    cached.cachedHoldings.mockResolvedValue([]);
    await visit();
    expect(cached.cachedQuotes).not.toHaveBeenCalled();
  });

  it("買賣能選的帳戶：啟用中的存款帳戶", async () => {
    await visit();

    expect((listProps().depositAccounts as { id: number }[]).map((item) => item.id)).toEqual([1]);
  });

  it.each([
    [{ add: "investment" }, true],
    [{ add: "deposit" }, false],
    [{}, false],
  ])("網址 %j_新增證券帳戶的視窗要不要自己打開：%s", async (search, openAdd) => {
    await visit(search);

    expect(listProps().openAdd).toBe(openAdd);
  });

  it("定期定額一區跟每月固定頁是同一個元件，這裡不再連回投資頁", async () => {
    await visit();

    expect(vi.mocked(RegularBuyList).mock.calls[0][0]).toMatchObject({ items: [], linkToInvestments: false });
  });
});

describe("投資頁的除權息", () => {
  it("只查啟用中證券帳戶裡還有股數的持股代號（排序去重）；停用的證券帳戶、賣光的不查", async () => {
    cached.cachedAccounts.mockResolvedValue([...ACCOUNTS, accountRow({ id: 7, name: "舊證券", kind: "investment", active: false })]);
    cached.cachedHoldings.mockResolvedValue([
      ...HOLDINGS,
      { id: 52, userId: "u", accountId: 7, symbol: "2330", name: "台積電", shares: 1, cost: 1000, sortOrder: 0, createdAt: CREATED },
      { id: 53, userId: "u", accountId: 6, symbol: "00919", name: "群益台灣精選高息", shares: 0, cost: 0, sortOrder: 2, createdAt: CREATED },
    ]);

    await visit();

    expect(cached.cachedDividends).toHaveBeenCalledWith(["0050", "006208"]);
  });

  it("沒有持股_不查除權息預告、不顯示卡片", async () => {
    cached.cachedHoldings.mockResolvedValue([]);

    await visit();

    expect(cached.cachedDividends).not.toHaveBeenCalled();
    expect(DividendsCard).not.toHaveBeenCalled();
  });

  it("除權息預告跟股價同時讀，不等股價讀完", async () => {
    let markAsked = () => {};
    const asked = new Promise<void>((resolve) => (markAsked = resolve));
    cached.cachedDividends.mockImplementation(async () => {
      markAsked();
      return [];
    });
    cached.cachedQuotes.mockImplementation(() => Promise.race([asked.then(() => []), new Promise((_, reject) => setTimeout(() => reject(new Error("沒有同時讀")), 500))]));

    await expect(visit()).resolves.toBeTypeOf("string");
  });

  it("006208 持有 238 股、11/18 除息每股 1.72 元_卡片的估計是 $409（238 × 1.72 = 409.36 捨去）", async () => {
    cached.cachedDividends.mockResolvedValue([{ symbol: "006208", exDate: "2026-11-18", kind: "cash", cashPerShare: "1.72" }]);

    await visit();

    expect(vi.mocked(DividendsCard).mock.calls[0][0].view).toEqual({
      status: "ready",
      rows: [{ symbol: "006208", name: "富邦台灣50", exDate: "2026-11-18", kind: "cash", daysLeft: 33, lastBuyToday: false, cashPerShare: "1.72", estimate: 409 }],
    });
  });

  it("持股都還沒有要除權息_不顯示卡片；預告表讀不到_卡片說暫時讀不到", async () => {
    await visit();
    expect(DividendsCard).not.toHaveBeenCalled();

    cached.cachedDividends.mockResolvedValue(null);
    await visit();
    expect(vi.mocked(DividendsCard).mock.calls[0][0].view).toEqual({ status: "unavailable" });
  });
});
