import { devEnv } from "./env";

// 開發時把對外請求改送到假伺服器（只換 origin），才不會用假資料打到真實服務；production 先返回，連設定都不讀
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

export type ExternalFetchOptions = {
  timeoutMs?: number;
  /** 測試替換用；沒給就用全域的 fetch */
  fetchImpl?: typeof fetch;
};

/** 對外請求一律經過這裡：外部服務沒回應時，函式不會一直卡到平台的時限 */
export async function externalFetch(url: string, init: RequestInit = {}, { timeoutMs = 15_000, fetchImpl = fetch }: ExternalFetchOptions = {}): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  return fetchImpl(externalUrl(url), { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}
