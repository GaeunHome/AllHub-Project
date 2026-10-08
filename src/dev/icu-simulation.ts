import { onTestFinished, vi } from "vitest";

type Part = { type: string; value: string };

/** 一種假想的 ICU：拿真正的 formatToParts 結果改寫 */
export type IcuVariant = { name: string; rewrite: (parts: Part[]) => Part[] };

const replaceSpaces = (space: string) => (parts: Part[]) =>
  parts.map((part) => (part.type === "literal" ? { ...part, value: part.value.replace(/\s/gu, space) } : part));

// 一位數補零、補過零的去掉，依賴 ICU 補零規則的寫法就會露出來
const togglePadding = (value: string) => (/^0\d$/.test(value) ? value.slice(1) : /^\d$/.test(value) ? `0${value}` : value);

/** 各版 ICU 真的出現過的空白差異，加上分隔符號、欄位順序與補零全都不同的極端情況 */
export const ICU_VARIANTS: IcuVariant[] = [
  { name: "空白換成 U+202F", rewrite: replaceSpaces("\u202f") },
  { name: "空白換成 U+00A0", rewrite: replaceSpaces("\u00a0") },
  { name: "空白換成 U+2009，ICU 78 的 zh-TW 實際輸出", rewrite: replaceSpaces("\u2009") },
  {
    name: "分隔符號、欄位順序與補零都不同",
    rewrite: (parts) => [...parts].reverse().map((part) => (part.type === "literal" ? { ...part, value: "." } : { ...part, value: togglePadding(part.value) })),
  },
];

const join = (parts: Part[]) => parts.map((part) => part.value).join("");

// Date#toLocale*String 拿不到 parts，只能把數字以外都當成 literal
const tokenize = (text: string): Part[] => (text.match(/\d+|\D+/g) ?? []).map((value) => ({ type: /\d/.test(value) ? "integer" : "literal", value }));

/** 在目前這個測試裡，把 Intl.DateTimeFormat 與 Date#toLocale*String 都換成指定 ICU 的輸出，測試結束自動還原 */
export function simulateIcu(variant: IcuVariant): void {
  const proto = Intl.DateTimeFormat.prototype;
  const formatToParts = proto.formatToParts;
  const rewritten = (dtf: Intl.DateTimeFormat, date?: Date | number) => variant.rewrite(formatToParts.call(dtf, date)) as Intl.DateTimeFormatPart[];
  const spies = [
    vi.spyOn(proto, "formatToParts").mockImplementation(function (this: Intl.DateTimeFormat, date) {
      return rewritten(this, date);
    }),
    // format 是回傳綁定函式的 getter；輸出要跟 formatToParts 一致，才像真的換了一版 ICU
    vi.spyOn(proto as { format: unknown }, "format", "get").mockImplementation(function (this: Intl.DateTimeFormat) {
      return (date?: Date | number) => join(rewritten(this, date));
    }),
    ...(["toLocaleString", "toLocaleDateString", "toLocaleTimeString"] as const).map((method) => {
      const original = Date.prototype[method] as (this: Date, ...args: unknown[]) => string;
      return vi.spyOn(Date.prototype, method).mockImplementation(function (this: Date, ...args: unknown[]) {
        return join(variant.rewrite(tokenize(original.apply(this, args))));
      });
    }),
  ];
  onTestFinished(() => spies.forEach((spy) => spy.mockRestore()));
}
