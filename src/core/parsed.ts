// 表單欄位的解析結果 錯誤訊息直接給使用者看
// 不 import 任何東西 lib 也能用

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });

export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** service 用 解析失敗時丟出模組自己的使用者錯誤 runAction 會原樣顯示訊息 */
export function valueOrThrow<T>(result: Parsed<T>, UserErrorType: new (message: string) => Error): T {
  if (!result.ok) throw new UserErrorType(result.error);
  return result.value;
}
