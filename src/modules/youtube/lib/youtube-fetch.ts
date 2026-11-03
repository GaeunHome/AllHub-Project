import { externalFetch } from "@/core/external-url";

// 頻道頁 RSS oEmbed 觀看頁與字幕共用這組 header
// 不帶 User-Agent 時 YouTube 比較容易回同意頁或擋掉
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
};

/** 對 YouTube 與 WebSub hub 的請求逾時 */
export const YOUTUBE_TIMEOUT_MS = 15_000;

/**
 * YouTube App 用的播放資訊 API 非官方 不用登入也不用金鑰
 * 版本號太舊時 YouTube 會拒絕 字幕清單讀不到時先看這裡
 */
const INNERTUBE_PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const ANDROID_CLIENT_NAME_ID = "3";
const ANDROID_CLIENT_VERSION = "20.10.38";

type PageOptions = { cache?: RequestCache; fetchImpl?: typeof fetch; redirect?: RequestRedirect; timeoutMs?: number };

/** 用瀏覽器的 header 讀 YouTube 的網頁 */
export function fetchYoutubePage(url: string, { cache, fetchImpl, redirect, timeoutMs = YOUTUBE_TIMEOUT_MS }: PageOptions = {}): Promise<Response> {
  return externalFetch(url, { headers: BROWSER_HEADERS, ...(cache ? { cache } : {}), ...(redirect ? { redirect } : {}) }, { timeoutMs, fetchImpl });
}

/** 用 ANDROID 用戶端問一支影片的播放資訊 回的是 JSON 欄位跟觀看頁的 ytInitialPlayerResponse 一樣 */
export function fetchInnertubePlayer(videoId: string, { fetchImpl, timeoutMs = YOUTUBE_TIMEOUT_MS }: Pick<PageOptions, "fetchImpl" | "timeoutMs"> = {}): Promise<Response> {
  return externalFetch(
    INNERTUBE_PLAYER_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `com.google.android.youtube/${ANDROID_CLIENT_VERSION} (Linux; U; Android 11) gzip`,
        "X-YouTube-Client-Name": ANDROID_CLIENT_NAME_ID,
        "X-YouTube-Client-Version": ANDROID_CLIENT_VERSION,
      },
      body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: ANDROID_CLIENT_VERSION, androidSdkVersion: 30, hl: "ko", gl: "KR" } }, videoId }),
      cache: "no-store",
    },
    { timeoutMs, fetchImpl },
  );
}
