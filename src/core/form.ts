import { logError } from "./errors";
import type { FormState } from "./ui/form-message";

// 不能加 use server 加了每個 export 都會變成可以直接 POST 的 action

/** 隱藏欄位被改過或畫面太舊時的共用訊息 */
export const INVALID_FORM_MESSAGE = "資料不正確，請重新整理頁面再試一次";

export function formText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

/** 資料表的 serial id 不是安全範圍內的正整數就回 null */
export function formId(formData: FormData, name: string): number | null {
  const id = Number(formData.get(name));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 帳號的 UUID 格式不對就回 null 不讓奇怪的字串進到查詢裡 */
export function formUuid(formData: FormData, name: string): string | null {
  const id = String(formData.get(name) ?? "").toLowerCase();
  return UUID.test(id) ? id : null;
}

/** true 與 false 以外都回 null Server Action 可以被直接 POST 不能把怪值當成 false */
export function formFlag(formData: FormData, name: string): boolean | null {
  const value = formData.get(name);
  return value === "true" ? true : value === "false" ? false : null;
}

/**
 * module 是 log 的前綴 action 用在 log 與畫面上的摘要
 * titled 給標題已經寫了失敗的 ResultBanner
 */
export type ActionScope = { module: string; action: string; titled?: boolean };

/**
 * 使用者輸入錯誤原樣顯示
 * 其他錯誤的 message 可能夾帶 SQL 與參數 畫面只給摘要 log 只記種類
 */
export function actionErrorMessage(scope: ActionScope, isUserError: (error: unknown) => boolean, error: unknown): string {
  if (error instanceof Error && isUserError(error)) return error.message;
  logError(scope.module, `${scope.action}失敗`, error);
  // 結果框的標題已經寫了失敗 說明再寫一次就重複了
  return scope.titled ? "原因不明（詳見伺服器 log）" : `${scope.action}失敗（詳見伺服器 log）`;
}

/**
 * 錯誤變成表單訊息 不會跳錯誤畫面
 * requireSession 與 redirect 會丟出 Next 的內部錯誤 要放在外面呼叫
 */
export async function runAction(scope: ActionScope, isUserError: (error: unknown) => boolean, work: () => Promise<FormState | string | void>): Promise<FormState> {
  try {
    const result = await work();
    return typeof result === "string" ? { message: result } : (result ?? {});
  } catch (error) {
    return { error: actionErrorMessage(scope, isUserError, error) };
  }
}
