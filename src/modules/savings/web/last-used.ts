import { createLocalPref } from "@/core/ui/local-pref";
import { parseRowId } from "../lib/validation";

// 每台裝置各自記得上次用的帳戶 記帳時預設帶入 不必每次重選

/** 跟伺服器一樣只認資料表的 id 認不得回 undefined 改用預設值 */
function parseStoredId(stored: string): number | undefined {
  return parseRowId(stored) ?? undefined;
}

const idPref = (key: string) => createLocalPref<number>({ key, defaultValue: 0, parse: parseStoredId });

/** 記帳上次用的帳戶 轉帳時是轉出的那個 */
export const lastAccountPref = idPref("allhub:savings:last-account");
/** 轉帳上次轉入的帳戶 */
export const lastTransferToPref = idPref("allhub:savings:last-transfer-to");
/** 發薪分配上次入帳的帳戶 */
export const lastSalaryAccountPref = idPref("allhub:savings:last-salary-account");

/** 依序挑第一個還在清單裡的 都停用或刪除了就用清單的第一個 */
export function pickAccount(options: readonly { id: number }[], ...preferred: (number | null | undefined)[]): number | undefined {
  const found = preferred.find((id) => id && options.some((option) => option.id === id));
  return found ?? options[0]?.id;
}

/** 轉帳的另一邊 從 exclude 以外的帳戶裡挑 */
export function pickOtherAccount(options: readonly { id: number }[], exclude: number | undefined, ...preferred: (number | null | undefined)[]): number | undefined {
  return pickAccount(
    options.filter((option) => option.id !== exclude),
    ...preferred,
  );
}
