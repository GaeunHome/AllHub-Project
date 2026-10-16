// 開拓月曆依 genshin.py 的 StarRailDiary 整理 還沒用真實帳號驗證

import { taipeiDateKey } from "@/core/time";
import { asRecord, createMissing, number, text } from "./json";
import { interpretWith, type HoyolabResult } from "./responses";

export type LedgerTotals = { jade: number | null; passes: number | null };
export type LedgerSource = { id: string | null; name: string | null; amount: number | null; percent: number | null };

export type Ledger = {
  /** YYYYMM */
  month: string;
  /** HoYoLAB 給得到的月份 YYYYMM 由舊到新 */
  months: string[];
  /** 這個月的星瓊與車票 */
  current: LedgerTotals;
  /** 今天拿到的 只有本月有意義 */
  today: LedgerTotals;
  /** 星瓊的來源 依數量由多到少 */
  sources: LedgerSource[];
};

export type LedgerResult = { ledger: Ledger; missing: string[] };

export function interpretLedger(json: unknown, requestedMonth: string): HoyolabResult<LedgerResult> {
  return interpretWith(json, (data) => parseLedger(data, requestedMonth));
}

/** 只有 lt 開頭的鍵時開拓月曆回 -100 genshin.py issue 151 補上這兩個就好 */
const LEDGER_KEYS = ["cookie_token_v2", "account_mid_v2"];

/**
 * 開拓月曆回 -100 或 10001 不代表整個 cookie 失效 便箋與簽到照樣能用
 * 只看送出的鍵名 訊息不帶 cookie 的值
 */
export function explainLedgerLogin<T>(result: HoyolabResult<T>, sentKeys: ReadonlySet<string>): HoyolabResult<T> {
  if (result.ok || !result.cookieInvalid) return result;
  const original = text(asRecord(result.raw)?.message);
  const message = LEDGER_KEYS.every((key) => sentKeys.has(key))
    ? `開拓月曆讀不到（${original ? `${result.retcode}：${original}` : result.retcode}），請重新貼上最新的 cookie`
    : "開拓月曆需要 cookie 裡的 cookie_token_v2 與 account_mid_v2：請用「新增帳號或更新 cookie」重新貼上包含這兩個欄位的 cookie";
  return { ...result, message, cookieInvalid: false };
}

export function parseLedger(data: unknown, requestedMonth: string): LedgerResult {
  const missing = createMissing();
  const root = asRecord(data);
  const monthData = asRecord(root?.month_data);
  if (!monthData) missing.add("month_data");
  const dayData = asRecord(root?.day_data);

  const at = (key: string) => `month_data.${key}`;
  const sources = (monthData ? missing.list(monthData, "group_by", at("group_by")) : []).flatMap((value) => {
    const source = asRecord(value);
    if (!source) return [];
    return [
      {
        id: text(source.action),
        name: missing.need(text(source.action_name), at("group_by[].action_name")),
        amount: missing.need(number(source.num), at("group_by[].num")),
        percent: missing.need(number(source.percent), at("group_by[].percent")),
      },
    ];
  });

  const month = normalizeMonth(root?.data_month, requestedMonth) ?? requestedMonth;
  const optional = Array.isArray(root?.optional_month) ? root.optional_month.flatMap((m) => normalizeMonth(m, month) ?? []) : [];
  const months = [...new Set([...optional, month])].sort();

  // month_data 整個不見時只記一筆 不用每個欄位都記
  const field = (record: Record<string, unknown> | null, key: string, path: string) => (record ? missing.need(number(record[key]), path) : null);
  return {
    ledger: {
      month,
      months,
      current: { jade: field(monthData, "current_hcoin", at("current_hcoin")), passes: field(monthData, "current_rails_pass", at("current_rails_pass")) },
      today: { jade: number(dayData?.current_hcoin), passes: number(dayData?.current_rails_pass) },
      sources: sources.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1)),
    },
    missing: missing.sorted(),
  };
}

/** YYYYMM 或只有月份都整理成 YYYYMM 只有月份時比參考月份大的算去年 */
function normalizeMonth(value: unknown, reference: string): string | null {
  const n = number(value);
  if (n === null || !Number.isInteger(n)) return null;
  if (n >= 190001 && n <= 999912 && n % 100 >= 1 && n % 100 <= 12) return String(n);
  if (n >= 1 && n <= 12 && /^\d{6}$/.test(reference)) {
    const year = Number(reference.slice(0, 4)) - (n > Number(reference.slice(4)) ? 1 : 0);
    return `${year}${String(n).padStart(2, "0")}`;
  }
  return null;
}

export function monthLabel(month: string): string {
  return /^\d{6}$/.test(month) ? `${month.slice(0, 4)} 年 ${Number(month.slice(4))} 月` : month;
}

/** 查詢用的月份以台北日期為準 HoYoLAB 的月份也是伺服器當地時間 */
export function ledgerMonthOf(date: Date): string {
  return taipeiDateKey(date).slice(0, 7).replace("-", "");
}

/** 千分位自己加 不依賴執行環境的語系資料 */
export function groupDigits(value: number): string {
  const sign = value < 0 ? "-" : "";
  return sign + String(Math.abs(Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
