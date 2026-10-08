import type { NotificationFeed } from "./types";

export const POLL_VISIBLE_MS = 10_000;
// 背景分頁的計時器本來就會被瀏覽器節流到約一分鐘一次，放慢也省資料庫查詢
export const POLL_HIDDEN_MS = 60_000;

export type PollResult = { status: "ok"; feed: NotificationFeed } | { status: "unauthorized" };

export type PollerOptions = {
  load: (signal: AbortSignal) => Promise<PollResult>;
  onFeed: (feed: NotificationFeed) => void;
  onUnauthorized?: () => void;
  isHidden: () => boolean;
};

export type Poller = { refresh(): void; visibilityChanged(): void; stop(): void };

/** 不依賴 React 的輪詢：每次抓完才排下一次，請求不會重疊；React 元件只負責接上 visibilitychange 等事件 */
export function startPoller({ load, onFeed, onUnauthorized, isHidden }: PollerOptions): Poller {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let inFlight = false;
  let queued = false;
  let stopped = false;

  const schedule = () => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(tick, isHidden() ? POLL_HIDDEN_MS : POLL_VISIBLE_MS);
  };

  async function tick() {
    if (stopped) return;
    // 正在抓的時候又被要求更新：等這次結束再補抓一次，結果才會是最新的
    if (inFlight) {
      queued = true;
      return;
    }
    clearTimeout(timer);
    inFlight = true;
    controller = new AbortController();
    try {
      const result = await load(controller.signal);
      if (stopped) return;
      if (result.status === "unauthorized") {
        stopped = true;
        onUnauthorized?.();
        return;
      }
      onFeed(result.feed);
    } catch {
      // 網路斷線或伺服器暫時出錯：下一輪再試
    } finally {
      inFlight = false;
    }
    if (queued && !stopped) {
      queued = false;
      void tick();
    } else {
      schedule();
    }
  }

  void tick();

  return {
    refresh: () => void tick(),
    visibilityChanged: () => (isHidden() ? schedule() : void tick()),
    stop() {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}
