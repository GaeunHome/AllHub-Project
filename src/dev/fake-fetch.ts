import { vi } from "vitest";

/** body 是 JSON 時解析好的內容，不是 JSON 時為空物件 */
export type FakeFetchCall = { url: string; init: RequestInit; body: Record<string, unknown> };

type Respond = (call: FakeFetchCall, index: number) => Response | Promise<Response>;

/** 記錄每次呼叫的假 fetch：impl 傳給 fetchImpl 參數或 vi.stubGlobal("fetch", …)；respond 依呼叫內容與第幾次呼叫決定回應，丟錯就模擬連線失敗 */
export function fakeFetch(respond: Respond) {
  const calls: FakeFetchCall[] = [];
  const urls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {}, body: jsonBody(init?.body) };
    calls.push(call);
    urls.push(call.url);
    return respond(call, calls.length - 1);
  });
  return { impl: impl as unknown as typeof fetch, calls, urls };
}

/** 依序回應，用完就一直用最後一個 */
export const inOrder =
  (...responses: Array<() => Response>): Respond =>
  (_call, index) =>
    responses[Math.min(index, responses.length - 1)]();

/** 依網址回應，都沒對上回 404 */
export const byUrl =
  (routes: Array<[RegExp, () => Response]>): Respond =>
  ({ url }) =>
    (routes.find(([pattern]) => pattern.test(url))?.[1] ?? (() => new Response("not found", { status: 404 })))();

/** 在 respond 裡等到請求被中止（逾時）才失敗，模擬一直沒回應的服務；沒帶 signal 的請求永遠等不到，直接失敗以免測試卡住 */
export function hangUntilAborted({ init }: FakeFetchCall): Promise<Response> {
  const signal = init.signal;
  if (!signal) return Promise.reject(new Error("這個請求沒有逾時，服務沒回應時會一直等下去"));
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function jsonBody(body: RequestInit["body"]): Record<string, unknown> {
  if (typeof body !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
