import { fail, ok, type Parsed } from "@/core/parsed";
import { parseShortText } from "./rules";

// 分帳 金額用外幣的分 匯率用百萬分之一 都是整數 才不會有浮點數的誤差

export const CURRENCIES = { TWD: "新台幣", JPY: "日圓", KRW: "韓元", USD: "美元", EUR: "歐元", GBP: "英鎊", HKD: "港幣", MOP: "澳門幣", CNY: "人民幣", SGD: "新加坡幣", THB: "泰銖", VND: "越南盾", MYR: "馬幣", IDR: "印尼盾", AUD: "澳幣" } as const;
export type Currency = keyof typeof CURRENCIES;
export const HOME_CURRENCY: Currency = "TWD";
const HOME_RATE_MICROS = 1_000_000;

export const EXPENSE_TITLE_MAX = 40;
export const EXPENSE_LIMIT = 300;
// 越南盾與印尼盾一筆就上千萬 上限要比理財高
const MAX_AMOUNT_CENTS = 2_000_000_000;
const MAX_RATE_MICROS = 2_000_000_000;
const MAX_TWD = 100_000_000;
const RATE_ROUNDING = 100_000_000;

export type ExpenseValues = { title: string; amountCents: number; currency: Currency; rateMicros: number };
export type ExpenseLine = { paidBy: string; amountCents: number; rateMicros: number; shares: readonly string[] };
export type SettlementLine = { fromUser: string; toUser: string; amountTwd: number };
export type Transfer = { from: string; to: string; amount: number };

export const isCurrency = (value: string): value is Currency => Object.hasOwn(CURRENCIES, value);

/** 十進位字串換成整數 超過小數位數或不是數字回 null 千分位的逗號可以有 */
function scaled(input: string, places: number): number | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(input.replaceAll(",", "").trim());
  if (!match || (match[2]?.length ?? 0) > places) return null;
  const value = Number(`${match[1]}${(match[2] ?? "").padEnd(places, "0")}`);
  return Number.isSafeInteger(value) ? value : null;
}

/** 整數換回十進位字串 給修改的表單預填 尾巴的 0 拿掉 */
function decimalText(value: number, places: number): string {
  const digits = String(value).padStart(places + 1, "0");
  const fraction = digits.slice(-places).replace(/0+$/, "");
  return fraction ? `${digits.slice(0, -places)}.${fraction}` : digits.slice(0, -places);
}

export const amountInput = (amountCents: number) => decimalText(amountCents, 2);
export const rateInput = (rateMicros: number) => decimalText(rateMicros, 6);

/** 乘起來會超過 Number 的精確範圍 要用 BigInt 四捨五入到元 */
export function twdOf(amountCents: number, rateMicros: number): number {
  return Number((BigInt(amountCents) * BigInt(rateMicros) + BigInt(RATE_ROUNDING / 2)) / BigInt(RATE_ROUNDING));
}

export function parseExpense(input: { title: string; amount: string; currency: string; rate: string }): Parsed<ExpenseValues> {
  const title = parseShortText(input.title, "項目", EXPENSE_TITLE_MAX);
  if (!title.ok) return title;
  if (!isCurrency(input.currency)) return fail("請選貨幣");
  const amountCents = scaled(input.amount, 2);
  if (amountCents === null || amountCents <= 0) return fail("金額要是大於 0 的數字，最多兩位小數");
  if (amountCents > MAX_AMOUNT_CENTS) return fail("金額太大了");
  const rateMicros = input.currency === HOME_CURRENCY ? HOME_RATE_MICROS : scaled(input.rate, 6);
  if (rateMicros === null || rateMicros <= 0 || rateMicros > MAX_RATE_MICROS) return fail("匯率要是大於 0 的數字，最多六位小數");
  if (twdOf(amountCents, rateMicros) > MAX_TWD) return fail("換算後的金額太大了");
  return ok({ title: title.value, amountCents, currency: input.currency, rateMicros });
}

/** 除不盡的零頭照 id 順序一人多一元 同一筆帳誰來算都一樣 */
export function splitEvenly(total: number, people: readonly string[]): Map<string, number> {
  const base = Math.floor(total / people.length);
  const extra = total - base * people.length;
  return new Map([...people].sort().map((id, index) => [id, base + (index < extra ? 1 : 0)]));
}

/** 正的是別人要給他 負的是他要給別人 結清過的已經算進去 */
export function balancesOf(expenses: readonly ExpenseLine[], settlements: readonly SettlementLine[]): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (id: string, amount: number) => balances.set(id, (balances.get(id) ?? 0) + amount);
  for (const { paidBy, amountCents, rateMicros, shares } of expenses) {
    if (shares.length === 0) continue;
    const total = twdOf(amountCents, rateMicros);
    add(paidBy, total);
    for (const [id, share] of splitEvenly(total, shares)) add(id, -share);
  }
  for (const { fromUser, toUser, amountTwd } of settlements) {
    add(fromUser, amountTwd);
    add(toUser, -amountTwd);
  }
  return balances;
}

/** 每次讓欠最多的還給應收最多的 比一筆一筆各自還少很多次轉帳 */
export function minimalTransfers(balances: ReadonlyMap<string, number>): Transfer[] {
  const people = [...balances].map(([id, balance]) => ({ id, balance }));
  const largest = (sign: 1 | -1) => people.filter(({ balance }) => balance * sign > 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || (a.id < b.id ? -1 : 1))[0];
  const transfers: Transfer[] = [];
  for (;;) {
    const [debtor, creditor] = [largest(-1), largest(1)];
    if (!debtor || !creditor) return transfers;
    const amount = Math.min(-debtor.balance, creditor.balance);
    transfers.push({ from: debtor.id, to: creditor.id, amount });
    debtor.balance += amount;
    creditor.balance -= amount;
  }
}
