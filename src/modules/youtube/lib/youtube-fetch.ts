import { externalFetch } from "@/core/external-url";

// 頻道頁、RSS、oEmbed、觀看頁與字幕共用同一組請求設定；不帶 User-Agent 時 YouTube 比較容易回同意頁或擋掉
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
};

/** 對 YouTube 與 WebSub hub 的請求逾時 */
export const YOUTUBE_TIMEOUT_MS = 15_000;

type PageOptions = { cache?: RequestCache; fetchImpl?: typeof fetch; timeoutMs?: number };

/** 用瀏覽器的 header 讀 YouTube 的網頁 */
export function fetchYoutubePage(url: string, { cache, fetchImpl, timeoutMs = YOUTUBE_TIMEOUT_MS }: PageOptions = {}): Promise<Response> {
  return externalFetch(url, { headers: BROWSER_HEADERS, ...(cache ? { cache } : {}) }, { timeoutMs, fetchImpl });
}
