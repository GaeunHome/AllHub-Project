import { logError } from "./errors";
import { USER_ID_PATTERN } from "./ids";
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

/** 帳號的 UUID 格式不對就回 null 不讓奇怪的字串進到查詢裡 */
export function formUuid(formData: FormData, name: string): string | null {
  const id = String(formData.get(name) ?? "").toLowerCase();
  return USER_ID_PATTERN.test(id) ? id : null;
}

/** true 與 false 以外都回 null Server Action 可以被直接 POST 不能把怪值當成 false */
export function formFlag(formData: FormData, name: string): boolean | null {
  const value = formData.get(name);
  return value === "true" ? true : value === "false" ? false : null;
}

/**
 * 訊息直接給使用者看的錯誤 例如輸入不對 runAction 原樣顯示
 * 訊息不能夾帶 SQL 憑證或外部回應的原文
 */
export class UserError extends Error {}

/**
 * module 是 log 的前綴 action 用在 log 與畫面上的摘要
 * titled 給標題已經寫了失敗的 ResultBanner
 */
export type ActionScope = { module: string; action: string; titled?: boolean };

/** UserError 以外也要原樣顯示的錯誤 例如外部服務回的說明 */
type IsUserError = (error: unknown) => boolean;
type ActionWork = () => Promise<FormState | string | void>;

/**
 * 使用者輸入錯誤原樣顯示 UserError 一律算 isUserError 可以再加
 * 其他錯誤的 message 可能夾帶 SQL 與參數 畫面只給摘要 log 只記種類
 */
export function actionErrorMessage(scope: ActionScope, error: unknown): string;
export function actionErrorMessage(scope: ActionScope, isUserError: IsUserError, error: unknown): string;
export function actionErrorMessage(scope: ActionScope, ...args: [unknown] | [IsUserError, unknown]): string {
  const [isUserError, error] = args.length === 1 ? [undefined, args[0]] : args;
  if (error instanceof UserError || (error instanceof Error && isUserError?.(error))) return error.message;
  logError(scope.module, `${scope.action}失敗`, error);
  // 結果框的標題已經寫了失敗 說明再寫一次就重複了
  return scope.titled ? "原因不明（詳見伺服器 log）" : `${scope.action}失敗（詳見伺服器 log）`;
}

/**
 * 錯誤變成表單訊息 不會跳錯誤畫面
 * requireSession 與 redirect 會丟出 Next 的內部錯誤 要放在外面呼叫
 */
export async function runAction(scope: ActionScope, work: ActionWork): Promise<FormState>;
export async function runAction(scope: ActionScope, isUserError: IsUserError, work: ActionWork): Promise<FormState>;
export async function runAction(scope: ActionScope, ...args: [ActionWork] | [IsUserError, ActionWork]): Promise<FormState> {
  const [isUserError, work] = args.length === 1 ? [undefined, args[0]] : args;
  try {
    const result = await work();
    return typeof result === "string" ? { message: result } : (result ?? {});
  } catch (error) {
    return { error: isUserError ? actionErrorMessage(scope, isUserError, error) : actionErrorMessage(scope, error) };
  }
}
