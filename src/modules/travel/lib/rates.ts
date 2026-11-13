import { CURRENCIES, HOME_CURRENCY, rateInput, type Currency } from "./expenses";

// 使用者要的 記外幣時自動帶入那筆日期的國際中間價 來源是 fawazahmed0/exchange-api 公眾領域 免金鑰
// 臺灣銀行的匯率網址會先跳機器人驗證 伺服器讀不到

/** 實際的日期與 1 外幣等於幾台幣 跟匯率欄位一樣是最多六位小數的字串 */
export type RateTable = { date: string; rates: Partial<Record<Currency, string>> };

/** latest 或 YYYY-MM-DD 那一天的 */
export type RateDay = "latest" | (string & {});

/** 今天的還沒出來 今天與之後都用最新的 */
export const rateDay = (spentOn: string, today: string): RateDay => (spentOn < today ? spentOn : "latest");

/** 官方說明要有備援 jsDelivr 出錯時改問 Cloudflare */
export const ratesUrls = (day: RateDay): string[] => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/twd.json`,
  `https://${day}.currency-api.pages.dev/v1/currencies/twd.json`,
];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** 回應是 1 台幣換多少外幣 倒過來四捨五入到百萬分之一 跟存檔的精度一樣 */
export function parseTwdRates(json: unknown): RateTable | null {
  if (!isRecord(json) || typeof json.date !== "string" || !isRecord(json.twd)) return null;
  const perTwd = json.twd;
  const rates: RateTable["rates"] = {};
  for (const currency of Object.keys(CURRENCIES) as Currency[]) {
    const value = perTwd[currency.toLowerCase()];
    if (currency === HOME_CURRENCY || typeof value !== "number" || !(value > 0)) continue;
    const micros = Math.round(1_000_000 / value);
    if (micros > 0 && Number.isSafeInteger(micros)) rates[currency] = rateInput(micros);
  }
  return { date: json.date, rates };
}
