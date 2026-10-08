import { expect, onTestFinished, vi, type Mock } from "vitest";
import * as nextCache from "./next-cache-stub";

// 測試共用的小工具；next/cache 的 spy 從 next-cache-stub 直接拿（跟 vitest alias 的是同一份），正式程式的 import 規則才不會把這裡當成違規

/** 清空 next/cache 的呼叫紀錄；每個測試前會自動執行，準備資料時呼叫過、不想算進去的話再手動呼叫一次 */
export function resetNextCache(): void {
  for (const spy of Object.values(nextCache)) spy.mockReset();
}

/** 快取函式標上的 tag（排序後） */
export const tagged = (): string[] => nextCache.cacheTag.mock.calls.flat().sort();

/** Server Action 用 updateTag 失效的 tag（排序後） */
export const updated = (): string[] => nextCache.updateTag.mock.calls.map(([tag]) => tag).sort();

/** 用 revalidateTag 失效的 tag（去重、排序）；同時確認每次都是 expire: 0，不是會先給舊資料的 profile */
export function expiredTags(): string[] {
  for (const [, profile] of nextCache.revalidateTag.mock.calls) expect(profile).toEqual({ expire: 0 });
  return [...new Set(nextCache.revalidateTag.mock.calls.map(([tag]) => tag))].sort();
}

/** 取出 vi.mock(path, { spy: true }) 換成 spy 的 export；跟手寫的 vi.fn() 一樣不檢查回傳值型別，測試資料只要給用得到的欄位 */
export function mocksOf<T extends object, K extends keyof T>(module: T, ...names: K[]): Record<K, Mock> {
  return Object.fromEntries(names.map((name) => [name, module[name]])) as unknown as Record<K, Mock>;
}

/** 模擬表單送出的 FormData */
export function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** 這個測試期間攔下 console.error（不印出來），測試結束自動還原；回傳的 spy 用來檢查 log 內容 */
export function captureErrorLog() {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => log.mockRestore());
  return log;
}

/** log 的全部內容；Error 物件連 message 與 stack 一起展開，才驗得出有沒有把原文印出去（JSON.stringify 會漏掉它們） */
export function loggedText(log: { mock: { calls: unknown[][] } }): string {
  return log.mock.calls
    .flat()
    .map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : typeof arg === "string" ? arg : JSON.stringify(arg)))
    .join(" ");
}
