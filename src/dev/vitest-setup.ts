import { beforeEach } from "vitest";
import { resetNextCache } from "./test-helpers";

// vitest.config.mts 的 setupFiles：每個測試都從沒有 next/cache 呼叫紀錄的狀態開始，測試檔不必自己清
beforeEach(() => {
  resetNextCache();
});

// 測試不能對外連線：模組改用 vi.mock(path, { spy: true }) 之後，忘了設定回應就會呼叫真的實作，在這裡先擋下來
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
// 同一個執行環境載入兩次時，第二次拿到的 fetch 已經是防護版，原本的要記在全域才不會自己呼叫自己
const ORIGINAL_FETCH = Symbol.for("allhub.originalFetch");
const holder = globalThis as typeof globalThis & { [ORIGINAL_FETCH]?: typeof fetch };
const originalFetch = (holder[ORIGINAL_FETCH] ??= globalThis.fetch);

const HOW_TO_FAKE = [
  "請在測試裡換成替身：",
  "- 經過 externalFetch 的程式：把 src/dev/fake-fetch.ts 的 fakeFetch(...).impl 傳給 fetchImpl 參數，或用 vi.stubGlobal(\"fetch\", fakeFetch(...).impl) 換掉全域 fetch",
  "- 用 vi.mock(path, { spy: true }) 換掉的函式：要用 mockResolvedValue／mockImplementation 設定回應，沒設定時會呼叫真的實作",
  "只有 localhost 與 127.0.0.1（例如本機的假伺服器）可以直接連。",
].join("\n");

function destination(input: RequestInfo | URL): URL | null {
  try {
    return new URL(input instanceof Request ? input.url : String(input));
  } catch {
    return null;
  }
}

globalThis.fetch = (input, init) => {
  const url = destination(input);
  // 網址解析不了就交給原本的 fetch，讓它照常丟出自己的錯誤
  if (!url || LOCAL_HOSTS.has(url.hostname)) return originalFetch(input, init);
  return Promise.reject(new Error(`測試不能對外連線（${url.origin}）。${HOW_TO_FAKE}`));
};
