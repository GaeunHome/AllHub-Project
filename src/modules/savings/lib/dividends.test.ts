import { describe, expect, it } from "vitest";
import {
  DividendFormatError,
  dividendNotice,
  dueDividendNotices,
  estimateDividend,
  heldDividends,
  heldShares,
  lastBuyDate,
  mergeDividendEvents,
  parseTpexDividends,
  parseTwseDividends,
  type DividendEvent,
  type HeldDividend,
} from "./dividends";

// 2026-10-29 抓一次的真實回應 原樣抄幾筆 欄位全是字串
// 證交所 https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL
const TWSE = [
  { Date: "1151022", Code: "0056", Name: "元大高股息", Exdividend: "息", StockDividendRatio: "", SubscriptionRatio: "", SubscriptionPricePerShare: "", CashDividend: "1.720000", SharesOffered: "", SharesEmpOwner: "", SharesholderOwner: "", StockHoldingRatio: "" },
  { Date: "1151106", Code: "00400A", Name: "主動國泰動能高息", Exdividend: "息", StockDividendRatio: "", SubscriptionRatio: "", SubscriptionPricePerShare: "", CashDividend: "", SharesOffered: "", SharesEmpOwner: "", SharesholderOwner: "", StockHoldingRatio: "" },
  {
    Date: "1151028",
    Code: "2025",
    Name: "千興",
    Exdividend: "權",
    StockDividendRatio: "",
    SubscriptionRatio: "0.23166845",
    SubscriptionPricePerShare: "10.0000",
    CashDividend: "0",
    SharesOffered: "4000000.00",
    SharesEmpOwner: "6000000.00",
    SharesholderOwner: "30000000.00",
    StockHoldingRatio: "173.75134292",
  },
  { Date: "1151119", Code: "01007T", Name: "兆豐國泰R2", Exdividend: "息", StockDividendRatio: "", SubscriptionRatio: "", SubscriptionPricePerShare: "", CashDividend: "0.215313", SharesOffered: "", SharesEmpOwner: "", SharesholderOwner: "", StockHoldingRatio: "" },
  { Date: "1151102", Code: "6165", Name: "浪凡", Exdividend: "息", StockDividendRatio: "", SubscriptionRatio: "", SubscriptionPricePerShare: "", CashDividend: "5.000000", SharesOffered: "", SharesEmpOwner: "", SharesholderOwner: "", StockHoldingRatio: "" },
];

// 櫃買中心 https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost
const tpexRow = (date: string, code: string, name: string, kind: string, stockRatio: string, cash: string, subscription = "0.00000000", price = "0.00") => ({
  ExRrightsExDividendDate: date,
  SecuritiesCompanyCode: code,
  CompanyName: name,
  ExRrightsExDividend: kind,
  StockDividendRatio: stockRatio,
  SubscriptionRatioToNewSharesIssued: subscription,
  SubscriptionPricePerShare: price,
  CashDividend: cash,
  AllocatedForPublicUnderwriting: "0",
  SubscribedByEmployees: "0",
  SubscribedByExistingShareholders: "0",
  SubscribedProRataInThousandShares: "0.00000000",
});
const TPEX = [
  tpexRow("1151020", "00931B", "統一美債20年", "除息", "0.00000000", "0.14100000"),
  tpexRow("1151103", "00950B", "凱基A級公司債", "除息", "0.00000000", "尚未公告"),
  tpexRow("1151027", "3691", "碩禾", "除權", "0.00000000", "0.00000000", "0.10883356", "80.00"),
  tpexRow("1151028", "2063", "世鎧", "除權息", "0.09999999", "0.50002080"),
];

describe("parseTwseDividends（證交所 TWT48U_ALL）", () => {
  it("民國年換成西元日期；息是現金股利，金額去掉多餘的 0；還沒公布（空字串）是 null；權的 0 是沒有現金股利（也可能是現金增資）", () => {
    expect(parseTwseDividends(TWSE)).toEqual([
      { symbol: "0056", exDate: "2026-10-22", kind: "cash", cashPerShare: "1.72" },
      { symbol: "00400A", exDate: "2026-11-06", kind: "cash", cashPerShare: null },
      { symbol: "2025", exDate: "2026-10-28", kind: "stock", cashPerShare: null },
      { symbol: "01007T", exDate: "2026-11-19", kind: "cash", cashPerShare: "0.215313" },
      { symbol: "6165", exDate: "2026-11-02", kind: "cash", cashPerShare: "5" },
    ]);
  });

  it("權息是兩個都有，現金股利照讀", () => {
    expect(parseTwseDividends([{ ...TWSE[0], Code: "2881", Exdividend: "權息", StockDividendRatio: "0.05000000", CashDividend: "1.500000" }])).toEqual([
      { symbol: "2881", exDate: "2026-10-22", kind: "both", cashPerShare: "1.5" },
    ]);
  });

  it("代號不合格、日期不存在（2/29）、認不得的種類、不是物件的列略過，其他照讀；空的清單就是沒有預告", () => {
    const rows = [{ ...TWSE[0], Code: "12" }, { ...TWSE[0], Date: "1150229" }, { ...TWSE[0], Exdividend: "減資" }, null, "x", TWSE[4]];

    expect(parseTwseDividends(rows).map((event) => event.symbol)).toEqual(["6165"]);
    expect(parseTwseDividends([])).toEqual([]);
  });

  it.each([{ stat: "error" }, "<html>", null])("回應不是陣列（%j）_丟 DividendFormatError，當成這個來源讀不到", (json) => {
    expect(() => parseTwseDividends(json)).toThrow(DividendFormatError);
  });

  it("有資料但一列都讀不出來（欄位改了名字）_丟 DividendFormatError，不當成最近沒有除權息", () => {
    expect(() => parseTwseDividends(TWSE.map(({ Code, ...row }) => ({ ...row, StockNo: Code })))).toThrow(DividendFormatError);
  });
});

describe("parseTpexDividends（櫃買中心 tpex_exright_prepost）", () => {
  it("除息的金額有 8 位小數（0.14100000 是 0.141）；還沒公布寫「尚未公告」是 null；除權的 0.00000000 是沒有現金股利；除權息兩個都有", () => {
    expect(parseTpexDividends(TPEX)).toEqual([
      { symbol: "00931B", exDate: "2026-10-20", kind: "cash", cashPerShare: "0.141" },
      { symbol: "00950B", exDate: "2026-11-03", kind: "cash", cashPerShare: null },
      { symbol: "3691", exDate: "2026-10-27", kind: "stock", cashPerShare: null },
      { symbol: "2063", exDate: "2026-10-28", kind: "both", cashPerShare: "0.5000208" },
    ]);
  });

  it("回應不是陣列_丟 DividendFormatError", () => {
    expect(() => parseTpexDividends({ message: "rate limited" })).toThrow(DividendFormatError);
  });

  it("有資料但一列都讀不出來（欄位改了名字）_丟 DividendFormatError", () => {
    expect(() => parseTpexDividends(TPEX.map(({ ExRrightsExDividendDate, ...row }) => ({ ...row, Date: ExRrightsExDividendDate })))).toThrow(DividendFormatError);
  });
});

describe("heldShares：算除權息的持股（頁面與排程共用）", () => {
  it("只算啟用中證券帳戶裡還有股數的（停用的證券帳戶、賣光的不算）", () => {
    const accounts = [
      { id: 6, kind: "investment", active: true },
      { id: 7, kind: "investment", active: true },
      { id: 8, kind: "investment", active: false },
      { id: 1, kind: "deposit", active: true },
    ];
    const holdings = [
      { accountId: 6, symbol: "006208", name: "富邦台50", shares: 600 },
      { accountId: 7, symbol: "006208", name: "富邦台50", shares: 400 },
      { accountId: 8, symbol: "0056", name: "元大高股息", shares: 1000 },
      { accountId: 6, symbol: "00919", name: "群益台灣精選高息", shares: 0 },
    ];

    expect(heldShares(accounts, holdings)).toEqual([
      { symbol: "006208", name: "富邦台50", shares: 600 },
      { symbol: "006208", name: "富邦台50", shares: 400 },
    ]);
  });
});

describe("mergeDividendEvents（同一個代號同一天合併成一筆）", () => {
  it("兩份表或同一份表的兩列：種類合起來（息加權是權息），金額用有公布的那一筆；照日期再照代號排", () => {
    const events: DividendEvent[] = [
      { symbol: "2881", exDate: "2026-11-20", kind: "stock", cashPerShare: null },
      { symbol: "0056", exDate: "2026-11-05", kind: "cash", cashPerShare: null },
      { symbol: "2881", exDate: "2026-11-20", kind: "cash", cashPerShare: "1.5" },
      { symbol: "0056", exDate: "2026-11-05", kind: "cash", cashPerShare: "0.866" },
      { symbol: "0050", exDate: "2026-11-05", kind: "cash", cashPerShare: "1" },
    ];

    expect(mergeDividendEvents(events)).toEqual([
      { symbol: "0050", exDate: "2026-11-05", kind: "cash", cashPerShare: "1" },
      { symbol: "0056", exDate: "2026-11-05", kind: "cash", cashPerShare: "0.866" },
      { symbol: "2881", exDate: "2026-11-20", kind: "both", cashPerShare: "1.5" },
    ]);
  });

  it("同一個代號不同天_各自一筆", () => {
    const events: DividendEvent[] = [
      { symbol: "0056", exDate: "2026-10-22", kind: "cash", cashPerShare: "1.72" },
      { symbol: "0056", exDate: "2027-01-21", kind: "cash", cashPerShare: null },
    ];

    expect(mergeDividendEvents(events)).toEqual(events);
  });
});

describe("estimateDividend（股數乘每股現金股利，元以下捨去，不經過浮點數）", () => {
  it.each([
    [1000, "1.72", 1720],
    // 46.953 捨去
    [333, "0.141", 46],
    // 浮點數算成 56.99999999999999 捨去後會少 1 元
    [100, "0.57", 57],
    // 500.0208 捨去
    [1000, "0.5000208", 500],
    [5, "5", 25],
    [1_000_000_000, "9.9147456", 9_914_745_600],
  ])("%i 股 × 每股 %s 元_是 %i 元", (shares, cash, amount) => {
    expect(estimateDividend(shares, cash)).toBe(amount);
  });
});

describe("lastBuyDate（最後買進日：除息前一個工作日，照人事總處的辦公日曆）", () => {
  it.each([
    ["2026-11-18", "2026-11-17", "週三除息_前一天週二"],
    ["2026-11-16", "2026-11-13", "週一除息_往前跳過週末到週五"],
    ["2026-10-27", "2026-10-23", "週二除息_10/26 補假加上週末，到週五"],
    ["2026-02-23", "2026-02-13", "春節後的週一除息_2/16～2/20 放假加上週末，到 2/13"],
  ])("%s_是 %s（%s）", (exDate, lastBuy) => {
    expect(lastBuyDate(exDate)).toBe(lastBuy);
  });
});

describe("dueDividendNotices（今天要寄哪幾種，照標題的優先順序：最後買進日、公布、金額）", () => {
  // 今天 10/29 週四 11/18 除息的最後買進日是 11/17 10/30 除息的最後買進日是今天
  const TODAY = "2026-10-29";
  const later = (cashPerShare: string | null): DividendEvent => ({ symbol: "006208", exDate: "2026-11-18", kind: "cash", cashPerShare });
  const tomorrow = (cashPerShare: string | null): DividendEvent => ({ symbol: "006208", exDate: "2026-10-30", kind: "cash", cashPerShare });
  const row = (amountNotified: boolean, reminded = false) => ({ amountNotified, reminded });

  it.each([
    ["還沒寄過_公布", later(null), null, ["announced"]],
    ["還沒寄過、金額已經公布_公布（金額寫在裡面）", later("1.72"), null, ["announced"]],
    ["公布寄過了、金額還沒公布_不寄", later(null), row(false), []],
    ["公布寄過了、金額晚幾天補上_金額", later("1.72"), row(false), ["amount"]],
    ["公布與金額都寄過了_不寄", later("1.72"), row(true), []],
    ["今天是最後買進日、還沒寄過_最後買進日與公布合成一則", tomorrow(null), null, ["last_buy", "announced"]],
    ["今天是最後買進日、金額剛補上_最後買進日與金額合成一則", tomorrow("1.72"), row(false), ["last_buy", "amount"]],
    ["今天是最後買進日、金額寄過了_最後買進日", tomorrow("1.72"), row(true), ["last_buy"]],
    ["今天是最後買進日、已經提醒過_不寄", tomorrow("1.72"), row(true, true), []],
  ])("%s", (_name, event, state, expected) => {
    expect(dueDividendNotices(event, state, TODAY)).toEqual(expected);
  });

  it("今天除息（最後買進日已經過了）_只寄公布；除息日已經過了_什麼都不寄", () => {
    expect(dueDividendNotices({ ...later(null), exDate: TODAY }, null, TODAY)).toEqual(["announced"]);
    expect(dueDividendNotices({ ...later("1.72"), exDate: "2026-10-28" }, null, TODAY)).toEqual([]);
  });
});

describe("dividendNotice（通知的種類與標題）", () => {
  const item = (event: Partial<DividendEvent>, shares = 1000, estimate: number | null = 1720): HeldDividend => ({
    symbol: "006208",
    name: "富邦台50",
    shares,
    event: { symbol: "006208", exDate: "2026-11-18", kind: "cash", cashPerShare: "1.72", ...event },
    estimate,
  });

  it.each([
    [["announced"], item({}), "dividend_announced", "006208 富邦台50 11/18 除息：每股配息 1.72 元，估計 $1,720"],
    [["announced"], item({ cashPerShare: null }, 1000, null), "dividend_announced", "006208 富邦台50 11/18 除息：配息金額還沒公布"],
    [["amount"], item({}), "dividend_amount", "006208 富邦台50 配息公布：每股配息 1.72 元，估計 $1,720（11/18 除息）"],
    [["last_buy", "announced"], item({ cashPerShare: null }, 1000, null), "dividend_last_buy", "今天是最後買進日：006208 富邦台50 11/18 除息"],
    [["last_buy", "amount"], item({}), "dividend_last_buy", "今天是最後買進日：006208 富邦台50 11/18 除息，每股配息 1.72 元，估計 $1,720"],
  ] as const)("%j_%s", (notices, held, kind, title) => {
    expect(dividendNotice([...notices], held)).toEqual({ kind, title });
  });

  it("只有除權（配股或現金增資）_只寫種類，不寫金額；除權息有現金股利時照寫", () => {
    const stock = { ...item({ kind: "stock", cashPerShare: null, exDate: "2026-10-27" }, 1000, null), symbol: "3691", name: "碩禾" };
    const both = { ...item({ kind: "both", cashPerShare: "0.5000208", exDate: "2026-10-28" }, 1000, 500), symbol: "2063", name: "世鎧" };

    expect(dividendNotice(["announced"], stock).title).toBe("3691 碩禾 10/27 除權");
    expect(dividendNotice(["last_buy", "announced"], stock).title).toBe("今天是最後買進日：3691 碩禾 10/27 除權");
    expect(dividendNotice(["announced"], both).title).toBe("2063 世鎧 10/28 除權息：每股配息 0.5000208 元，估計 $500");
  });
});

describe("heldDividends（自己持有的代號、除權息日是今天以後的）", () => {
  const TODAY = "2026-10-29";
  const EVENTS: DividendEvent[] = [
    { symbol: "0056", exDate: "2026-10-22", kind: "cash", cashPerShare: "1.72" },
    { symbol: "006208", exDate: "2026-11-18", kind: "cash", cashPerShare: "1.72" },
    { symbol: "00679B", exDate: "2026-10-29", kind: "cash", cashPerShare: null },
    { symbol: "2330", exDate: "2026-11-12", kind: "cash", cashPerShare: "6" },
    { symbol: "2882", exDate: "2026-11-03", kind: "stock", cashPerShare: null },
  ];

  it("同一個代號跨帳戶合計股數（600 + 400 股 × 1.72 元 = $1,720），名稱用先列出的那一筆；照除權息日排", () => {
    const holdings = [
      { symbol: "006208", name: "富邦台50", shares: 600 },
      { symbol: "00679B", name: "元大美債20年", shares: 2000 },
      { symbol: "006208", name: "富邦台灣50", shares: 400 },
      { symbol: "2882", name: "國泰金", shares: 1000 },
    ];

    expect(heldDividends(EVENTS, holdings, TODAY)).toEqual([
      { symbol: "00679B", name: "元大美債20年", shares: 2000, event: EVENTS[2], estimate: null },
      { symbol: "2882", name: "國泰金", shares: 1000, event: EVENTS[4], estimate: null },
      { symbol: "006208", name: "富邦台50", shares: 1000, event: EVENTS[1], estimate: 1720 },
    ]);
  });

  it("已經過去的除權息（0056 10/22）、沒持有的代號（2330）、賣光的（0 股）都不算", () => {
    const holdings = [
      { symbol: "0056", name: "元大高股息", shares: 1000 },
      { symbol: "2882", name: "國泰金", shares: 0 },
    ];

    expect(heldDividends(EVENTS, holdings, TODAY)).toEqual([]);
  });
});
