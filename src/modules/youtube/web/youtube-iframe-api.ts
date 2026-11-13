// YouTube 官方的 IFrame Player API 只能用 script 載入

export type YtPlayer = { getCurrentTime(): number; getPlaybackRate?(): number; destroy(): void };
export type YtEvent = { data: number };
type YtNamespace = { Player: new (element: HTMLElement, options: object) => YtPlayer };
declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * YouTube 自己的全螢幕會讓疊上去的字幕消失 iPhone 也一律關掉改用自己的
 * 手機上維持在頁面裡播放
 */
export const YOUTUBE_PLAYER_VARS = { rel: 0, cc_load_policy: 0, playsinline: 1, fs: 0 } as const;

/** IFrame Player API 的播放狀態 緩衝也停止推算時間 */
export const PLAYER_STATE = { ended: 0, playing: 1, paused: 2 };

let apiPromise: Promise<YtNamespace> | undefined;
/** iframe_api 還會再載入一支 script 那支失敗時沒有任何事件 只能靠逾時發現 */
const LOAD_TIMEOUT_MS = 30_000;

/** 全頁只能載一次 失敗時清掉快取 下次掛載才能重試 */
export function loadYoutubeApi(): Promise<YtNamespace> {
  apiPromise ??= new Promise<YtNamespace>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const script = document.createElement("script");
    const timer = setTimeout(() => fail(), LOAD_TIMEOUT_MS);
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("YouTube IFrame API 載入失敗"));
    };
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      previous?.();
      resolve(window.YT!);
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    apiPromise = undefined;
    throw error;
  });
  return apiPromise;
}
