// 假的證交所與櫃買中心 OpenAPI 欄位與收盤價照 2026-10-14 的真實回應
// 日期換成今天之前最近的平日 像真的 API 一樣是前一個交易日

/** 今天台北時間之前最近的週一到週五 例如 1151014 */
function previousTradingDay(now = new Date()) {
  const taipei = new Date(now.getTime() + 8 * 3_600_000);
  const day = new Date(Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), taipei.getUTCDate()));
  do day.setUTCDate(day.getUTCDate() - 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  const pad = (value) => String(value).padStart(2, "0");
  return `${day.getUTCFullYear() - 1911}${pad(day.getUTCMonth() + 1)}${pad(day.getUTCDate())}`;
}

// Code Name TradeVolume TradeValue Open High Low Close Change Transaction
const TWSE_ROWS = [
  ["0050", "元大台灣50", "64109641", "7264314036", "113.00", "113.75", "112.75", "113.00", "0.6000", "78354"],
  ["0056", "元大高股息", "31914087", "1893392462", "58.70", "59.70", "58.70", "59.60", "1.0500", "23962"],
  ["006208", "富邦台50", "1524741", "395737303", "257.90", "260.60", "257.90", "258.70", "0.8500", "6255"],
  ["00878", "國泰永續高股息", "22238333", "787012076", "35.41", "35.50", "35.22", "35.47", "0.1300", "14885"],
  ["00919", "群益台灣精選高息", "49168241", "1588009975", "32.48", "32.50", "32.27", "32.49", "0.0900", "22370"],
  ["2330", "台積電", "28111940", "70485890790", "2505.00", "2535.00", "2490.00", "2490.00", "0.0000", "91202"],
  ["2317", "鴻海", "34513643", "8415365944", "241.50", "246.00", "241.00", "243.00", "3.0000", "27738"],
  ["2454", "聯發科", "7854685", "35535185705", "4525.00", "4600.00", "4475.00", "4475.00", "-50.0000", "84295"],
  ["2412", "中華電", "9187455", "1363431483", "148.00", "149.50", "147.50", "148.50", "0.5000", "5315"],
  ["2881", "富邦金", "28828049", "4546120154", "158.50", "160.50", "155.50", "160.50", "0.5000", "15537"],
  ["2882", "國泰金", "21362123", "2425135786", "114.00", "115.00", "112.00", "114.00", "-0.5000", "8004"],
  ["2891", "中信金", "33119725", "2359959770", "71.90", "71.90", "70.60", "71.40", "-0.2000", "15573"],
  // 沒有成交 價格欄位是空字串
  ["00625K", "富邦上証+R", "", "", "", "", "", "", "0.0000", ""],
  ["00682U", "期元大美元指數", "140", "2955", "", "", "", "", "0.0000", "1"],
];

// Code Name Close Change Open High Low TradingShares TransactionAmount TransactionNumber Bid Ask Capitals LimitUp LimitDown
const TPEX_ROWS = [
  ["00679B", "元大美債20年", "25.05", "+0.07", "24.96", "25.06", "24.96", "20117000", "503340780", "1968", "25.05", "25.06", "6235692000", "9999.95", "0.01"],
  ["00687B", "國泰20年美債", "26.04", "+0.10", "25.98", "26.06", "25.94", "10521000", "273681070", "1255", "26.04", "26.05", "4317880380", "9999.95", "0.01"],
  ["00937B", "群益ESG投等債20+", "13.87", "0.00", "13.85", "13.89", "13.81", "37718000", "522783960", "3626", "13.87", "13.88", "17363805000", "9999.95", "0.01"],
  ["6488", "環球晶", "1020.00", "+5.00", "1020.00", "1030.00", "994.00", "10247000", "10381233000", "7017", "1020.00", "1025.00", "528113725", "1120.00", "918.00"],
  ["8299", "群聯", "1965.00", "0.00", "1980.00", "1990.00", "1945.00", "1567000", "3085695000", "1338", "1965.00", "1970.00", "221383247", "2160.00", "1770.00"],
  ["3105", "穩懋", "557.00", "+1.00", "559.00", "570.00", "552.00", "11711000", "6560506000", "9099", "556.00", "557.00", "423940384", "612.00", "502.00"],
  ["5347", "世界", "176.00", "+1.00", "178.00", "178.50", "172.50", "8186000", "1436470000", "5170", "176.00", "176.50", "1878502192", "193.50", "158.50"],
  // 沒有成交 價格欄位是 ----
  ["00986B", "FT金融債10+", "----", "---", "----", "----", "----", "0", "0", "0", "9.24", "9.30", "19262000", "9999.95", "0.01"],
  ["2064", "晉椿", "----", "---", "----", "----", "----", "0", "0", "0", "11.85", "11.95", "69330000", "13.00", "10.70"],
];

// 真的清單有上千筆 網站把不到 100 筆的清單當成讀不到 補上示範用的股票
const FILLER_COUNT = 120;
const fillerPrice = (i) => `${10 + (i % 90)}.${String((i * 7) % 100).padStart(2, "0")}`;
const TWSE_FILLER = Array.from({ length: FILLER_COUNT }, (_, i) => {
  const price = fillerPrice(i);
  return [String(1101 + i), `示範上市${1101 + i}`, "1000", "10000", price, price, price, price, "0.0000", "10"];
});
const TPEX_FILLER = Array.from({ length: FILLER_COUNT }, (_, i) => {
  const price = fillerPrice(i);
  return [String(3201 + i), `示範上櫃${3201 + i}`, price, "0.00", price, price, price, "1000", "10000", "10", price, price, "1000000", "9999.95", "0.01"];
});

export function twseQuotes(now) {
  const date = previousTradingDay(now);
  return [...TWSE_ROWS, ...TWSE_FILLER].map(([Code, Name, TradeVolume, TradeValue, OpeningPrice, HighestPrice, LowestPrice, ClosingPrice, Change, Transaction]) => ({
    Date: date,
    Code,
    Name,
    TradeVolume,
    TradeValue,
    OpeningPrice,
    HighestPrice,
    LowestPrice,
    ClosingPrice,
    Change,
    Transaction,
  }));
}

export function tpexQuotes(now) {
  const date = previousTradingDay(now);
  return [...TPEX_ROWS, ...TPEX_FILLER].map(
    ([SecuritiesCompanyCode, CompanyName, Close, Change, Open, High, Low, TradingShares, TransactionAmount, TransactionNumber, LatestBidPrice, LatesAskPrice, Capitals, NextLimitUp, NextLimitDown]) => ({
      Date: date,
      SecuritiesCompanyCode,
      CompanyName,
      Close,
      Change,
      Open,
      High,
      Low,
      TradingShares,
      TransactionAmount,
      TransactionNumber,
      LatestBidPrice,
      LatesAskPrice,
      Capitals,
      NextLimitUp,
      NextLimitDown,
    }),
  );
}

export function handle({ url, json }) {
  if (url.pathname === "/v1/exchangeReport/STOCK_DAY_ALL") return json(200, twseQuotes());
  if (url.pathname === "/openapi/v1/tpex_mainboard_quotes") return json(200, tpexQuotes());
  return false;
}
