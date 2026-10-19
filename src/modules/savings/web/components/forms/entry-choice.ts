import { latestOf } from "../../../lib/dates";
import type { AccountKind, CategoryKind, EntryKind } from "../../../lib/kinds";

// 記帳與固定收支的欄位連動 不依賴 React 才能直接測

/** 選填的欄位由頁面帶進來 沒帶就不做那一項 交給伺服器檢查 */
export type ChoiceAccount = { id: number; kind?: AccountKind; payFromAccountId?: number | null; startDate?: string; withHoldings?: boolean };
type ChoiceCategory = { id: number; kind: CategoryKind };

/** cardPayment 是自動排成繳卡費的那張卡 自己改過轉出或轉入就清掉 */
export type EntryChoice = { kind: EntryKind; accountId: number | undefined; counterId: number | undefined; categoryId: number | null; cardPayment: number | null };

export type EntryChoiceEvent = { type: "kind"; kind: EntryKind } | { type: "account"; id: number } | { type: "counter"; id: number } | { type: "category"; id: number | null };

export type ChoiceStart = { kind: EntryKind; accountId: number | undefined; counterAccountId: number | undefined; categoryId: number | null };

/** 繳卡費優先從卡設定的扣款帳戶轉出 不在選項裡就用第一個存款帳戶 */
function paymentSource(accounts: readonly ChoiceAccount[], card: ChoiceAccount): number | undefined {
  const deposits = accounts.filter((account) => account.id !== card.id && account.kind === "deposit");
  return deposits.find((account) => account.id === card.payFromAccountId)?.id ?? deposits[0]?.id;
}

/** 轉帳的選單 有持股的投資帳戶要用買進賣出 不列 已經選了的留著 修改舊紀錄才不會默默換掉 */
export function transferOptions<T extends ChoiceAccount>(accounts: readonly T[], keep: readonly (number | undefined)[]): T[] {
  return accounts.filter((account) => !account.withHoldings || keep.includes(account.id));
}

/** 換到轉帳時 有持股的投資帳戶換成能轉的帳戶 */
function transferable(choice: EntryChoice, accounts: readonly ChoiceAccount[]): EntryChoice {
  const allowed = transferOptions(accounts, []);
  const has = (id: number | undefined) => allowed.some((account) => account.id === id);
  const accountId = has(choice.accountId) ? choice.accountId : allowed[0]?.id;
  const counterId = has(choice.counterId) && choice.counterId !== accountId ? choice.counterId : allowed.find((account) => account.id !== accountId)?.id;
  return { ...choice, accountId, counterId };
}

/** 從信用卡轉帳多半是繳卡費 所以卡改當轉入 找不到扣款帳戶就不動 */
function arrangeCardPayment(choice: EntryChoice, accounts: readonly ChoiceAccount[]): EntryChoice {
  const card = accounts.find((account) => account.id === choice.accountId && account.kind === "credit");
  const source = card && paymentSource(accounts, card);
  if (!card || source === undefined) return choice;
  return { ...choice, accountId: source, counterId: card.id, cardPayment: card.id };
}

function changeKind(choice: EntryChoice, kind: EntryKind, accounts: readonly ChoiceAccount[], categories: readonly ChoiceCategory[]): EntryChoice {
  // 清掉不符合新類型的分類 打好的金額 日期 備註都留著
  const categoryId = categories.some((category) => category.id === choice.categoryId && category.kind === kind) ? choice.categoryId : null;
  const next = { ...choice, kind, categoryId };
  if (kind === "transfer" && choice.kind !== "transfer") return arrangeCardPayment(transferable(next, accounts), accounts);
  // 自動排的繳卡費沒動過就換回收支 帳戶回到那張卡
  if (kind !== "transfer" && choice.kind === "transfer" && choice.cardPayment !== null && choice.counterId === choice.cardPayment) {
    return { ...next, accountId: choice.cardPayment, counterId: choice.accountId, cardPayment: null };
  }
  return next;
}

/** 轉出和轉入撞到同一個帳戶時兩邊對調 accounts 與 categories 是表單的選項 */
export function entryChoiceReducer(accounts: readonly ChoiceAccount[], categories: readonly ChoiceCategory[]) {
  return (choice: EntryChoice, event: EntryChoiceEvent): EntryChoice => {
    switch (event.type) {
      case "kind":
        return changeKind(choice, event.kind, accounts, categories);
      case "account":
        return { ...choice, accountId: event.id, counterId: event.id === choice.counterId ? choice.accountId : choice.counterId, cardPayment: null };
      case "counter":
        return { ...choice, accountId: event.id === choice.accountId ? choice.counterId : choice.accountId, counterId: event.id, cardPayment: null };
      case "category":
        return { ...choice, categoryId: event.id };
    }
  };
}

/** arrange 是新的紀錄 一開始就是轉帳又是卡時排成繳卡費 修改舊紀錄照原本的 */
export function initialEntryChoice(start: ChoiceStart, accounts: readonly ChoiceAccount[], arrange: boolean): EntryChoice {
  const choice: EntryChoice = { kind: start.kind, accountId: start.accountId, counterId: start.counterAccountId, categoryId: start.categoryId, cardPayment: null };
  return arrange && choice.kind === "transfer" ? arrangeCardPayment(transferable(choice, accounts), accounts) : choice;
}

/** 轉帳要有另一個帳戶可以轉入 */
export function cannotTransfer(choice: EntryChoice): boolean {
  return choice.kind === "transfer" && (choice.counterId === undefined || choice.accountId === undefined);
}

/** 開始記帳之前的日期伺服器不收 轉帳看比較晚開始的那個帳戶 */
export function entryStartDate(choice: EntryChoice, accounts: readonly ChoiceAccount[]): string | undefined {
  const ids = choice.kind === "transfer" ? [choice.accountId, choice.counterId] : [choice.accountId];
  return latestOf(ids.map((id) => accounts.find((account) => account.id === id)?.startDate)) ?? undefined;
}
