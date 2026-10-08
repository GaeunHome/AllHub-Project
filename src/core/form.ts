import { logError } from "./errors";
import type { FormState } from "./ui/form-message";

// Server Action 共用的欄位解析與錯誤處理。不能加 "use server"：加了每個 export 都會變成可以直接 POST 的 action

/** 隱藏欄位被改過、或畫面太舊（資料已在別處刪掉）時的共用訊息 */
export const INVALID_FORM_MESSAGE = "資料不正確，請重新整理頁面再試一次";

export function formText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

/** 資料表的 serial id：不是安全範圍內的正整數就回 null */
export function formId(formData: FormData, name: string): number | null {
  const id = Number(formData.get(name));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** "true"／"false" 以外都回 null：Server Action 可以被直接 POST，不能把奇怪的值當成 false */
export function formFlag(formData: FormData, name: string): boolean | null {
  const value = formData.get(name);
  return value === "true" ? true : value === "false" ? false : null;
}

/** module 用在 log 的前綴，action 用在 log 與畫面上的摘要（「加入主播失敗」） */
export type ActionScope = { module: string; action: string };

/** 使用者輸入錯誤原樣顯示；其他錯誤的 message 可能夾帶 SQL 與參數，畫面只給摘要、log 只記錯誤種類 */
export function actionErrorMessage(scope: ActionScope, isUserError: (error: unknown) => boolean, error: unknown): string {
  if (error instanceof Error && isUserError(error)) return error.message;
  logError(scope.module, `${scope.action}失敗`, error);
  return `${scope.action}失敗（詳見伺服器 log）`;
}

/** 錯誤都變成表單上的訊息，不丟出去變成錯誤畫面；requireSession() 與 redirect() 會丟出 Next 的內部錯誤，要放在外面呼叫。updateTags 放 finally 還是成功之後由各 action 決定 */
export async function runAction(scope: ActionScope, isUserError: (error: unknown) => boolean, work: () => Promise<FormState | string | void>): Promise<FormState> {
  try {
    const result = await work();
    return typeof result === "string" ? { message: result } : (result ?? {});
  } catch (error) {
    return { error: actionErrorMessage(scope, isUserError, error) };
  }
}
