import { describe, expect, it } from "vitest";
import { QuoteFormatError, formatPrice, normalizeSymbol, parseTpexQuotes, parseTwseQuotes, priceToCents, quoteSymbols, rocDateToKey } from "./quotes";

// 2026-10-15 抓一次的真實回應 原樣抄幾筆 欄位全是字串
// 證交所 https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
const TWSE = [
  { Date: "1151014", Code: "0050", Name: "元大台灣50", TradeVolume: "64109641", TradeValue: "7264314036", OpeningPrice: "113.00", HighestPrice: "113.75", LowestPrice: "112.75", ClosingPrice: "113.00", Change: "0.6000", Transaction: "78354" },
  { Date: "1151014", Code: "006208", Name: "富邦台50", TradeVolume: "1524741", TradeValue: "395737303", OpeningPrice: "257.90", HighestPrice: "260.60", LowestPrice: "257.90", ClosingPrice: "258.70", Change: "0.8500", Transaction: "6255" },
  { Date: "1151014", Code: "2330", Name: "台積電", TradeVolume: "28111940", TradeValue: "70485890790", OpeningPrice: "2505.00", HighestPrice: "2535.00", LowestPrice: "2490.00", ClosingPrice: "2490.00", Change: "0.0000", Transaction: "91202" },
  { Date: "1151014", Code: "00625K", Name: "富邦上証+R", TradeVolume: "", TradeValue: "", OpeningPrice: "", HighestPrice: "", LowestPrice: "", ClosingPrice: "", Change: "0.0000", Transaction: "" },
  { Date: "1151014", Code: "00682U", Name: "期元大美元指數", TradeVolume: "140", TradeValue: "2955", OpeningPrice: "", HighestPrice: "", LowestPrice: "", ClosingPrice: "", Change: "0.0000", Transaction: "1" },
];
// 櫃買中心 https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes
const TPEX = [
  {
    Date: "1151014",
    SecuritiesCompanyCode: "00679B",
    CompanyName: "元大美債20年",
    Close: "25.05",
    Change: "+0.07",
    Open: "24.96",
    High: "25.06",
    Low: "24.96",
    TradingShares: "20117000",
    TransactionAmount: "503340780",
    TransactionNumber: "1968",
    LatestBidPrice: "25.05",
    LatesAskPrice: "25.06",
    Capitals: "6235692000",
    NextLimitUp: "9999.95",
    NextLimitDown: "0.01",
  },
  {
    Date: "1151014",
    SecuritiesCompanyCode: "00986B",
    CompanyName: "FT金融債10+",
    Close: "----",
    Change: "---",
    Open: "----",
    High: "----",
    Low: "----",
    TradingShares: "0",
    TransactionAmount: "0",
    TransactionNumber: "0",
    LatestBidPrice: "9.24",
    LatesAskPrice: "9.30",
    Capitals: "19262000",
    NextLimitUp: "9999.95",
    NextLimitDown: "0.01",
  },
];

describe("parseTwseQuotes（證交所 STOCK_DAY_ALL）", () => {
  it("收盤價換成分、民國年換成西元日期；沒成交（空字串）的收盤價是 null", () => {
    expect(parseTwseQuotes(TWSE)).toEqual([
      { symbol: "0050", name: "元大台灣50", closeCents: 11_300, date: "2026-10-14", market: "twse" },
      { symbol: "006208", name: "富邦台50", closeCents: 25_870, date: "2026-10-14", market: "twse" },
      { symbol: "2330", name: "台積電", closeCents: 249_000, date: "2026-10-14", market: "twse" },
      { symbol: "00625K", name: "富邦上証+R", closeCents: null, date: "2026-10-14", market: "twse" },
      { symbol: "00682U", name: "期元大美元指數", closeCents: null, date: "2026-10-14", market: "twse" },
    ]);
  });

  it("代號不合格或缺名稱的列略過、其他照讀", () => {
    const rows = [{ ...TWSE[0], Code: "12" }, { ...TWSE[1], Name: "" }, null, "x", TWSE[2]];

    expect(parseTwseQuotes(rows).map((quote) => quote.symbol)).toEqual(["2330"]);
  });

  it.each([{ stat: "error" }, "<html>", null])("回應不是陣列（%j）_丟 QuoteFormatError，當成這個來源讀不到", (json) => {
    expect(() => parseTwseQuotes(json)).toThrow(QuoteFormatError);
  });
});

describe("parseTpexQuotes（櫃買中心 tpex_mainboard_quotes）", () => {
  it("上櫃 ETF 00679B 讀得到；沒成交（----）的收盤價是 null", () => {
    expect(parseTpexQuotes(TPEX)).toEqual([
      { symbol: "00679B", name: "元大美債20年", closeCents: 2505, date: "2026-10-14", market: "tpex" },
      { symbol: "00986B", name: "FT金融債10+", closeCents: null, date: "2026-10-14", market: "tpex" },
    ]);
  });
});

describe("priceToCents（收盤價換成整數的分，不經過浮點數）", () => {
  it.each([
    ["123.45", 12_345],
    ["113.00", 11_300],
    ["10005.00", 1_000_500],
    ["25.05", 2505],
    ["0.05", 5],
    ["7", 700],
    ["1.005", 101],
    ["1.004", 100],
  ])("%j_是 %i 分", (text, cents) => {
    expect(priceToCents(text)).toBe(cents);
  });

  it.each(["", "----", "--", "abc", "1,234.00", "-1.00", "0.00", "0"])("%j_沒有價格（null）", (text) => {
    expect(priceToCents(text)).toBeNull();
  });
});

describe("rocDateToKey（民國年月日）", () => {
  it.each([
    ["1151014", "2026-10-14"],
    ["1160101", "2027-01-01"],
    ["991231", "2010-12-31"],
    ["1150229", null],
    ["1151301", null],
    ["", null],
  ])("%j_是 %s", (text, expected) => {
    expect(rocDateToKey(text)).toBe(expected);
  });
});

describe("normalizeSymbol（去空白、轉大寫、4 到 6 碼英數）", () => {
  it.each([
    [" 006208 ", "006208"],
    ["00679b", "00679B"],
    ["2330", "2330"],
    ["0 0 5 0", "0050"],
    ["2330.TW", null],
    ["123", null],
    ["1234567", null],
    ["台積電", null],
  ])("%j_是 %s", (input, expected) => {
    expect(normalizeSymbol(input)).toBe(expected);
  });

  it("快取 key 的代號清單：正規化、去重、排序，不合格的丟掉", () => {
    expect(quoteSymbols(["006208", "0050", "00679b", "006208", "bad"])).toEqual(["0050", "006208", "00679B"]);
  });
});

describe("formatPrice（收盤價的顯示）", () => {
  it.each([
    [25_870, "258.70"],
    [2505, "25.05"],
    [5, "0.05"],
    [123_457, "1,234.57"],
    [1_000_500, "10,005.00"],
  ])("%i 分_%s（千元以上加千分位）", (cents, text) => {
    expect(formatPrice(cents)).toBe(text);
  });
});
