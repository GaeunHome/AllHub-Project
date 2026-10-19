import { devEnv } from "./env";
import { logError } from "./errors";

// 開發時只把 origin 換成假伺服器 才不會用假資料打到真實服務
// production 先返回 連設定都不讀
export function externalUrl(url: string): string {
  if (process.env.NODE_ENV === "production") return url;
  const override = devEnv().DEV_EXTERNAL_ORIGIN;
  if (!override) return url;

  const target = new URL(url);
  const origin = new URL(override);
  target.protocol = origin.protocol;
  target.host = origin.host;
  return target.toString();
}

/**
 * 瀏覽器直接載入的外部圖片 開發時一樣改寫到假伺服器 E2E 才不會連到真的 CDN
 * 不是 http 或 https 的網址回 null 畫面改用文字頭像或圖示
 */
export function externalAssetUrl(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  // 協定相對網址在 HTTPS 網站上本來就是 https 先補上才驗得出合不合法
  const absolute = value.startsWith("//") ? `https:${value}` : value;
  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return externalUrl(absolute);
}

export type ExternalFetchOptions = {
  timeoutMs?: number;
  /** 測試替換用 沒給就用全域的 fetch */
  fetchImpl?: typeof fetch;
};

/** 對外請求一律經過這裡 外部服務沒回應時才不會一直卡到平台的時限 */
export async function externalFetch(url: string, init: RequestInit = {}, { timeoutMs = 15_000, fetchImpl = fetch }: ExternalFetchOptions = {}): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  return fetchImpl(externalUrl(url), { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}

/** 外部服務回了錯誤的狀態碼 logError 會一起印出 status */
export class HttpStatusError extends Error {
  name = "HttpStatusError";

  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export type ReadJsonOptions<T> = ExternalFetchOptions & {
  /** 讀不到時的 log 例如 module 是 weather what 是讀不到天氣預報 */
  module: string;
  what: string;
  /** Accept 一律是 JSON 其他設定放這裡 例如 cache */
  init?: Omit<RequestInit, "headers">;
  /** 在同一段裡解析 解析時丟錯也當成讀不到 */
  parse?: (json: unknown) => T;
};

/**
 * 讀外部服務的 JSON 狀態碼不對 逾時 連不上 不是 JSON 或解析失敗都回 null
 * log 只記錯誤種類與狀態碼 不記網址與回應內容 網址可能帶授權碼
 */
export async function readExternalJson<T = unknown>(url: string, { module, what, init, parse, ...options }: ReadJsonOptions<T>): Promise<T | null> {
  try {
    const response = await externalFetch(url, { ...init, headers: { Accept: "application/json" } }, options);
    if (!response.ok) throw new HttpStatusError(response.status);
    const json: unknown = await response.json();
    return parse ? parse(json) : (json as T);
  } catch (error) {
    logError(module, what, error);
    return null;
  }
}
