import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, onTestFinished, vi, type Mock } from "vitest";
import * as nextCache from "./next-cache-stub";

// 直接從 next-cache-stub 拿 spy 跟 alias 是同一份
// 從 next/cache import 的話會被快取規則當成違規

/**
 * 清空 next/cache 的呼叫紀錄 每個測試前會自動執行
 * 準備資料時的呼叫不想算進去時再手動呼叫一次
 */
export function resetNextCache(): void {
  for (const spy of Object.values(nextCache)) spy.mockReset();
}

/** 元件算繪成的 HTML 伺服器元件先 await 再傳進來 */
export const markup = (node: ReactNode): string => renderToStaticMarkup(node);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

/**
 * 畫面上看得到的字 去掉標籤後把 React 跳脫的字元換回來
 * spaced 時每個標籤換成空白再合併連續空白 用來比對前後有分隔的詞
 */
export function textOf(html: string, { spaced = false }: { spaced?: boolean } = {}): string {
  const text = spaced ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : html.replace(/<[^>]+>/g, "");
  // 一次全部換完 跳脫過兩次的字才不會被換回兩次
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal?: string, hex?: string, name?: string) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ENTITIES[name!.toLowerCase()] ?? entity;
  });
}

/** 快取函式標上的 tag 已排序 */
export const tagged = (): string[] => nextCache.cacheTag.mock.calls.flat().sort();

/** Server Action 用 updateTag 失效的 tag 已排序 */
export const updated = (): string[] => nextCache.updateTag.mock.calls.map(([tag]) => tag).sort();

/**
 * 用 revalidateTag 失效的 tag 去重並排序
 * 順便確認每次都是 expire 0 不是會先給舊資料的 profile
 */
export function expiredTags(): string[] {
  for (const [, profile] of nextCache.revalidateTag.mock.calls) expect(profile).toEqual({ expire: 0 });
  return [...new Set(nextCache.revalidateTag.mock.calls.map(([tag]) => tag))].sort();
}

/**
 * 取出 vi.mock 的 spy 模式換成 spy 的 export
 * 跟手寫的 vi.fn 一樣不檢查回傳型別 測試資料只給用得到的欄位
 */
export function mocksOf<T extends object, K extends keyof T>(module: T, ...names: K[]): Record<K, Mock> {
  return Object.fromEntries(names.map((name) => [name, module[name]])) as unknown as Record<K, Mock>;
}

/** 模擬表單送出的 FormData */
export function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/**
 * 這個測試期間攔下 console.error 不印出來 結束時自動還原
 * 回傳的 spy 用來檢查 log 內容
 */
export function captureErrorLog() {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => log.mockRestore());
  return log;
}

/**
 * log 的全部內容 Error 連 message 與 stack 一起展開
 * JSON.stringify 會漏掉它們 就驗不出有沒有把原文印出去
 */
export function loggedText(log: { mock: { calls: unknown[][] } }): string {
  return log.mock.calls
    .flat()
    .map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : typeof arg === "string" ? arg : JSON.stringify(arg)))
    .join(" ");
}
