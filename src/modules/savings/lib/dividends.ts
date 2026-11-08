import { asRecord, text } from "@/core/json";
import { addDays, formatSlashDate, type DateKey } from "./dates";
import { shiftForHoliday } from "./holidays";
import { formatTwd } from "./money";
import { normalizeSymbol, rocDateToKey } from "./quotes";

// TWT48U_ALL 與 tpex_exright_prepost 的預告表 沒有發放日
// 日期是民國年 沒公布的股利證交所是空字串 櫃買寫尚未公告

/** cash 只有現金股利 stock 只有除權 也可能是現金增資 both 兩個都有 */
export type DividendKind = "cash" | "stock" | "both";
export const DIVIDEND_KIND_LABELS: Record<DividendKind, string> = { cash: "除息", stock: "除權", both: "除權息" };

/** cashPerShare 是每股現金股利 去掉多餘 0 的十進位字串 例如 1.72 還沒公布或沒有現金股利是 null */
export type DividendEvent = { symbol: string; exDate: DateKey; kind: DividendKind; cashPerShare: string | null };

/** 回應不是陣列 或有資料卻一列都讀不出來 多半是對方改版或回了錯誤頁 當成這個來源讀不到 */
export class DividendFormatError extends Error {
  name = "DividendFormatError";
}

const TWSE_KINDS: Record<string, DividendKind> = { 息: "cash", 權: "stock", 權息: "both" };
const TPEX_KINDS: Record<string, DividendKind> = { 除息: "cash", 除權: "stock", 除權息: "both" };

const DECIMAL = /^(\d{1,9})(?:\.(\d{1,12}))?$/;

/** 1.720000 是 1.72 0.14100000 是 0.141 沒公布或是 0 時回 null */
function cashPerShareOf(raw: string): string | null {
  const match = DECIMAL.exec(raw.trim());
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (whole === "0" && fraction === "") return null;
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

type Keys = { date: string; symbol: string; kind: string; cash: string };

function parseRows(json: unknown, source: string, keys: Keys, kinds: Record<string, DividendKind>): DividendEvent[] {
  if (!Array.isArray(json)) throw new DividendFormatError(`${source} 回應不是陣列`);
  const events = json.flatMap((row): DividendEvent[] => {
    const record = asRecord(row);
    if (record === null) return [];
    const field = (key: string) => text(record[key], { allowBlank: true })?.trim() ?? "";
    const symbol = normalizeSymbol(field(keys.symbol));
    const exDate = rocDateToKey(field(keys.date));
    const kind = Object.hasOwn(kinds, field(keys.kind)) ? kinds[field(keys.kind)] : null;
    if (symbol === null || exDate === null || kind === null) return [];
    // 只有除權的列現金股利寫 0 不是還沒公布
    return [{ symbol, exDate, kind, cashPerShare: kind === "stock" ? null : cashPerShareOf(field(keys.cash)) }];
  });
  // 欄位改了名字時每一列都會略過 不能當成最近沒有除權息
  if (json.length > 0 && events.length === 0) throw new DividendFormatError(`${source} 讀不出任何一列`);
  return events;
}

export function parseTwseDividends(json: unknown): DividendEvent[] {
  return parseRows(json, "twse", { date: "Date", symbol: "Code", kind: "Exdividend", cash: "CashDividend" }, TWSE_KINDS);
}

export function parseTpexDividends(json: unknown): DividendEvent[] {
  return parseRows(json, "tpex", { date: "ExRrightsExDividendDate", symbol: "SecuritiesCompanyCode", kind: "ExRrightsExDividend", cash: "CashDividend" }, TPEX_KINDS);
}

const byDateThenSymbol = (a: { exDate: DateKey; symbol: string }, b: { exDate: DateKey; symbol: string }) =>
  a.exDate === b.exDate ? (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0) : a.exDate < b.exDate ? -1 : 1;

/** 同一個代號同一天在兩份表或兩列都有時合併 種類合起來 金額用有公布的 */
export function mergeDividendEvents(events: readonly DividendEvent[]): DividendEvent[] {
  const merged = new Map<string, DividendEvent>();
  for (const event of events) {
    const key = `${event.symbol} ${event.exDate}`;
    const seen = merged.get(key);
    merged.set(key, seen ? { ...seen, kind: seen.kind === event.kind ? seen.kind : "both", cashPerShare: seen.cashPerShare ?? event.cashPerShare } : event);
  }
  return [...merged.values()].sort(byDateThenSymbol);
}

/** 股數乘每股現金股利 元以下捨去 不扣匯費與二代健保補充保費 用整數算才不會少 1 元 */
export function estimateDividend(shares: number, cashPerShare: string): number {
  const [whole, fraction = ""] = cashPerShare.split(".");
  // 編譯目標不支援 bigint 的次方 用字串組出 10 的幾次方
  return Number((BigInt(shares) * BigInt(whole + fraction)) / BigInt(`1${"0".repeat(fraction.length)}`));
}

/** 除息前一個工作日 照人事總處的辦公日曆 跟證交所的休市日可能差一兩天 */
export function lastBuyDate(exDate: DateKey): DateKey {
  return shiftForHoliday(addDays(exDate, -1), "before");
}

/** 持股的代號 名稱與股數 lib 不能 import data 多的欄位沒關係 */
export type HeldShares = { symbol: string; name: string; shares: number };

type AccountLike = { id: number; kind: string; active: boolean };
type HoldingLike = { accountId: number; symbol: string; name: string; shares: number };

/** 啟用中的證券帳戶裡還有股數的持股才算 投資頁的卡片與排程寄的通知共用 */
export function heldShares(accounts: readonly AccountLike[], holdings: readonly HoldingLike[]): HeldShares[] {
  const active = new Set(accounts.filter((account) => account.kind === "investment" && account.active).map((account) => account.id));
  return holdings.filter((holding) => active.has(holding.accountId) && holding.shares > 0).map(({ symbol, name, shares }) => ({ symbol, name, shares }));
}

/** estimate 是估計的現金股利 沒有金額時是 null */
export type HeldDividend = HeldShares & { event: DividendEvent; estimate: number | null };

/**
 * 自己持有的代號 除權息日是今天以後的 照日期排
 * 同一個代號跨帳戶合計股數 名稱用先列出的那一筆 0 股的不算
 */
export function heldDividends(events: readonly DividendEvent[], holdings: readonly HeldShares[], today: DateKey): HeldDividend[] {
  const held = new Map<string, HeldShares>();
  for (const { symbol, name, shares } of holdings) {
    if (shares <= 0) continue;
    const seen = held.get(symbol);
    held.set(symbol, seen ? { ...seen, shares: seen.shares + shares } : { symbol, name, shares });
  }
  return events
    .flatMap((event): HeldDividend[] => {
      const holding = held.get(event.symbol);
      if (!holding || event.exDate < today) return [];
      return [{ ...holding, event, estimate: event.cashPerShare === null ? null : estimateDividend(holding.shares, event.cashPerShare) }];
    })
    .sort((a, b) => byDateThenSymbol(a.event, b.event));
}

/** announced 公布除權息 amount 配息金額晚幾天補上 last_buy 今天是最後買進日 */
export type DividendNotice = "announced" | "amount" | "last_buy";

/** 有這一列就是公布寄過了 */
export type DividendNoticeRow = { amountNotified: boolean; reminded: boolean };

/** 今天要寄的 照標題的優先順序排 同一天的合成一則 公布時已經有金額就不另外寄金額 */
export function dueDividendNotices(event: DividendEvent, row: DividendNoticeRow | null, today: DateKey): DividendNotice[] {
  if (event.exDate < today) return [];
  const notices: DividendNotice[] = [];
  if (lastBuyDate(event.exDate) === today && !row?.reminded) notices.push("last_buy");
  if (row === null) notices.push("announced");
  else if (!row.amountNotified && event.cashPerShare !== null) notices.push("amount");
  return notices;
}

export const perShareText = (cashPerShare: string) => `每股配息 ${cashPerShare} 元`;

/** 標題照最重要的那一種寫 已經知道的金額一起寫 只有除權的不寫金額 */
export function dividendNotice(notices: readonly DividendNotice[], { symbol, name, event, estimate }: HeldDividend): { kind: string; title: string } {
  const [first] = notices;
  const head = `${symbol} ${name}`;
  const day = `${formatSlashDate(event.exDate)} ${DIVIDEND_KIND_LABELS[event.kind]}`;
  const cash = event.cashPerShare === null || estimate === null ? null : `${perShareText(event.cashPerShare)}，估計 ${formatTwd(estimate)}`;
  const kind = `dividend_${first}`;
  // 鈴鐺面板只顯示一行 最急的放開頭
  if (first === "last_buy") return { kind, title: `今天是最後買進日：${head} ${day}${cash ? `，${cash}` : ""}` };
  if (first === "amount" && cash) return { kind, title: `${head} 配息公布：${cash}（${day}）` };
  if (event.kind === "stock") return { kind, title: `${head} ${day}` };
  return { kind, title: `${head} ${day}：${cash ?? "配息金額還沒公布"}` };
}
