import { fail, ok, type Parsed } from "@/core/parsed";
import { isRealDateKey } from "@/core/time";
import { parseShortText } from "./rules";

// 分帳 金額用外幣的分 匯率用百萬分之一 都是整數 才不會有浮點數的誤差

export const CURRENCIES = { TWD: "新台幣", JPY: "日圓", KRW: "韓元", USD: "美元", EUR: "歐元", GBP: "英鎊", HKD: "港幣", MOP: "澳門幣", CNY: "人民幣", SGD: "新加坡幣", THB: "泰銖", VND: "越南盾", MYR: "馬幣", IDR: "印尼盾", AUD: "澳幣" } as const;
export type Currency = keyof typeof CURRENCIES;
export const HOME_CURRENCY: Currency = "TWD";
const HOME_RATE_MICROS = 1_000_000;

// 使用者選的八類 舊的帳沒有類別算其他
export const EXPENSE_CATEGORIES = { food: "餐飲", transport: "交通", lodging: "住宿", tickets: "門票", shopping: "購物", fun: "娛樂", souvenirs: "伴手禮", other: "其他" } as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
export const isExpenseCategory = (value: string): value is ExpenseCategory => Object.hasOwn(EXPENSE_CATEGORIES, value);

export const SPLIT_MODES = { even: "平分", amount: "照金額", ratio: "照比例" } as const;
export type SplitMode = keyof typeof SPLIT_MODES;
const isSplitMode = (value: string): value is SplitMode => Object.hasOwn(SPLIT_MODES, value);
/** 照比例時每個人最多幾份 */
export const MAX_UNITS = 99;

export const EXPENSE_TITLE_MAX = 40;
export const EXPENSE_LIMIT = 300;
// 越南盾與印尼盾一筆就上千萬 上限要比理財高
const MAX_AMOUNT_CENTS = 2_000_000_000;
const MAX_RATE_MICROS = 2_000_000_000;
const MAX_TWD = 100_000_000;
const RATE_ROUNDING = 100_000_000;

export type ExpenseValues = { title: string; amountCents: number; currency: Currency; rateMicros: number; spentOn: string; category: ExpenseCategory };
/** 誰刷了多少 外幣的分 */
export type Payment = { userId: string; amountCents: number };
/** weight 平分是 null 照比例是份數 照金額是外幣的分 */
export type Share = { userId: string; weight: number | null };
export type ExpenseLine = { payers: readonly Payment[]; rateMicros: number; shares: readonly Share[] };
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
/** 表單打字時先算 不合格是 null */
export const centsOf = (input: string) => scaled(input, 2);
export const rateMicrosOf = (input: string) => scaled(input, 6);
export const rateInput = (rateMicros: number) => decimalText(rateMicros, 6);

/** 乘起來會超過 Number 的精確範圍 要用 BigInt 四捨五入到元 */
export function twdOf(amountCents: number, rateMicros: number): number {
  return Number((BigInt(amountCents) * BigInt(rateMicros) + BigInt(RATE_ROUNDING / 2)) / BigInt(RATE_ROUNDING));
}

export function parseExpense(input: { title: string; amount: string; currency: string; rate: string; spentOn: string; category: string }): Parsed<ExpenseValues> {
  const title = parseShortText(input.title, "項目", EXPENSE_TITLE_MAX);
  if (!title.ok) return title;
  if (!isCurrency(input.currency)) return fail("請選貨幣");
  const amountCents = scaled(input.amount, 2);
  if (amountCents === null || amountCents <= 0) return fail("金額要是大於 0 的數字，最多兩位小數");
  if (amountCents > MAX_AMOUNT_CENTS) return fail("金額太大了");
  const rateMicros = input.currency === HOME_CURRENCY ? HOME_RATE_MICROS : scaled(input.rate, 6);
  if (rateMicros === null || rateMicros <= 0 || rateMicros > MAX_RATE_MICROS) return fail("匯率要是大於 0 的數字，最多六位小數");
  if (twdOf(amountCents, rateMicros) > MAX_TWD) return fail("換算後的金額太大了");
  if (!isRealDateKey(input.spentOn)) return fail("請選日期");
  if (!isExpenseCategory(input.category)) return fail("請選類別");
  return ok({ title: title.value, amountCents, currency: input.currency, rateMicros, spentOn: input.spentOn, category: input.category });
}

/** 每個人填的金額加起來要等於這一筆 說差多少才知道怎麼改 */
function sumProblem(what: string, total: number, amountCents: number): string | null {
  if (total === amountCents) return null;
  const gap = amountInput(Math.abs(amountCents - total));
  return `${what}加起來要等於 ${amountInput(amountCents)}，${total < amountCents ? "還差" : "多了"} ${gap}`;
}

/** 每個人填的格子 空的或 0 的人不算 */
function filled(portions: Readonly<Record<string, string>>, places: number): Parsed<{ userId: string; value: number }[]> {
  const entries: { userId: string; value: number }[] = [];
  for (const [userId, text] of Object.entries(portions)) {
    if (text.trim() === "") continue;
    const value = scaled(text, places);
    if (value === null) return fail(places === 0 ? "份數要是 0 到 99 的整數" : "每個人的金額要是數字，最多兩位小數");
    if (value > 0) entries.push({ userId, value });
  }
  return ok(entries);
}

/** checked 是平分時勾的人 portions 是照金額或照比例時每個人填的 */
export function parseShares(input: { split: string; checked: readonly string[]; portions: Readonly<Record<string, string>> }, amountCents: number): Parsed<{ split: SplitMode; shares: Share[] }> {
  if (!isSplitMode(input.split)) return fail("請選怎麼分");
  if (input.split === "even") {
    const shares = [...new Set(input.checked)].map((userId) => ({ userId, weight: null }));
    return shares.length === 0 ? fail("請選要分這筆帳的人") : ok({ split: "even", shares });
  }
  const entries = filled(input.portions, input.split === "amount" ? 2 : 0);
  if (!entries.ok) return entries;
  if (entries.value.length === 0) return fail("請填要分這筆帳的人");
  if (input.split === "ratio" && entries.value.some(({ value }) => value > MAX_UNITS)) return fail(`份數要是 0 到 ${MAX_UNITS} 的整數`);
  const problem = input.split === "amount" ? sumProblem("每個人的金額", entries.value.reduce((sum, { value }) => sum + value, 0), amountCents) : null;
  if (problem) return fail(problem);
  return ok({ split: input.split, shares: entries.value.map(({ userId, value }) => ({ userId, weight: value })) });
}

/** many 是好幾個人付 這時看 amounts 一個人付時整筆都是 paidBy 的 */
export function parsePayers(input: { many: boolean; paidBy: string; amounts: Readonly<Record<string, string>> }, amountCents: number): Parsed<Payment[]> {
  if (!input.many) return input.paidBy ? ok([{ userId: input.paidBy, amountCents }]) : fail("請選付錢的人");
  const entries = filled(input.amounts, 2);
  if (!entries.ok) return entries;
  if (entries.value.length === 0) return fail("請填誰付了多少");
  const problem = sumProblem("每個人付的", entries.value.reduce((sum, { value }) => sum + value, 0), amountCents);
  return problem ? fail(problem) : ok(entries.value.map(({ userId, value }) => ({ userId, amountCents: value })));
}

/** 記還款 任意金額 台幣整數 */
export function parseRepayment(input: { from: string; to: string; amount: string }): Parsed<{ from: string; to: string; amountTwd: number }> {
  if (!input.from || !input.to) return fail("請選誰給誰");
  if (input.from === input.to) return fail("給錢與收錢的不能是同一個人");
  const amountTwd = scaled(input.amount, 0);
  if (amountTwd === null || amountTwd <= 0 || amountTwd > MAX_TWD) return fail("金額要是大於 0 的整數");
  return ok({ from: input.from, to: input.to, amountTwd });
}

/**
 * 照比例分 先取整數 剩下的零頭給小數最大的人 一樣大時照 id 順序
 * 比例都一樣就是平分 一人多一元的規則跟以前一樣 乘起來會超過 Number 的精確範圍所以用 BigInt
 */
export function allocate(total: number, weights: ReadonlyMap<string, number>): Map<string, number> {
  const ids = [...weights.keys()].sort();
  const sum = ids.reduce((acc, id) => acc + BigInt(weights.get(id) ?? 0), BigInt(0));
  if (sum === BigInt(0)) return new Map(ids.map((id) => [id, 0]));
  const parts = ids.map((id) => {
    const product = BigInt(total) * BigInt(weights.get(id) ?? 0);
    return { id, amount: Number(product / sum), rest: product % sum };
  });
  let left = total - parts.reduce((acc, part) => acc + part.amount, 0);
  for (const part of parts.toSorted((a, b) => (a.rest === b.rest ? 0 : a.rest < b.rest ? 1 : -1))) {
    if (left <= 0) break;
    part.amount += 1;
    left -= 1;
  }
  return new Map(parts.map(({ id, amount }) => [id, amount]));
}

/** 一筆帳每個人刷的與分到的台幣 兩邊合計一樣 帳才平 沒有人分的是 null */
export function expenseParts({ payers, rateMicros, shares }: ExpenseLine): { paid: Map<string, number>; owed: Map<string, number> } | null {
  if (shares.length === 0 || payers.length === 0) return null;
  const total = twdOf(
    payers.reduce((sum, payer) => sum + payer.amountCents, 0),
    rateMicros,
  );
  return {
    paid: allocate(total, new Map(payers.map((payer) => [payer.userId, payer.amountCents]))),
    owed: allocate(total, new Map(shares.map((share) => [share.userId, share.weight ?? 1]))),
  };
}

export type PersonTotals = { paid: number; share: number; balance: number };

/** 差額正的是別人要給他 負的是他要給別人 還過的錢已經算進去 */
export function personTotals(expenses: readonly ExpenseLine[], settlements: readonly SettlementLine[]): Map<string, PersonTotals> {
  const totals = new Map<string, PersonTotals>();
  const of = (id: string) => {
    let entry = totals.get(id);
    if (!entry) totals.set(id, (entry = { paid: 0, share: 0, balance: 0 }));
    return entry;
  };
  for (const expense of expenses) {
    const parts = expenseParts(expense);
    if (!parts) continue;
    for (const [id, amount] of parts.paid) {
      of(id).paid += amount;
      of(id).balance += amount;
    }
    for (const [id, amount] of parts.owed) {
      of(id).share += amount;
      of(id).balance -= amount;
    }
  }
  for (const { fromUser, toUser, amountTwd } of settlements) {
    of(fromUser).balance += amountTwd;
    of(toUser).balance -= amountTwd;
  }
  return totals;
}

export function balancesOf(expenses: readonly ExpenseLine[], settlements: readonly SettlementLine[]): Map<string, number> {
  return new Map([...personTotals(expenses, settlements)].map(([id, { balance }]) => [id, balance]));
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
