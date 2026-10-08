import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLL_HIDDEN_MS, POLL_VISIBLE_MS, startPoller, type PollResult } from "./poller";
import type { NotificationFeed } from "./types";

const feed = (total: number): NotificationFeed => ({ unread: { total, byModule: {} }, recent: [] });

function setup(load: (signal: AbortSignal) => Promise<PollResult> = vi.fn(async (): Promise<PollResult> => ({ status: "ok", feed: feed(1) }))) {
  let hidden = false;
  const onFeed = vi.fn();
  const onUnauthorized = vi.fn();
  const poller = startPoller({ load, onFeed, onUnauthorized, isHidden: () => hidden });
  return {
    load,
    onFeed,
    onUnauthorized,
    poller,
    setHidden(value: boolean) {
      hidden = value;
      poller.visibilityChanged();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startPoller", () => {
  it("一開始立刻抓一次_之後頁面可見時每 10 秒一次", async () => {
    const t = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.load).toHaveBeenCalledTimes(1);
    expect(t.onFeed).toHaveBeenCalledWith(feed(1));

    await vi.advanceTimersByTimeAsync(POLL_VISIBLE_MS - 1);
    expect(t.load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.load).toHaveBeenCalledTimes(2);
    expect(POLL_VISIBLE_MS).toBe(10_000);
    t.poller.stop();
  });

  it("頁面在背景時放慢（每 60 秒）", async () => {
    const t = setup();
    await vi.advanceTimersByTimeAsync(0);

    t.setHidden(true);
    await vi.advanceTimersByTimeAsync(POLL_HIDDEN_MS - 1);
    expect(t.load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.load).toHaveBeenCalledTimes(2);
    expect(POLL_HIDDEN_MS).toBeGreaterThan(POLL_VISIBLE_MS);
    t.poller.stop();
  });

  it("切回前景_立刻抓一次，再恢復每 10 秒", async () => {
    const t = setup();
    await vi.advanceTimersByTimeAsync(0);
    t.setHidden(true);
    await vi.advanceTimersByTimeAsync(10_000);

    t.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(POLL_VISIBLE_MS);
    expect(t.load).toHaveBeenCalledTimes(3);
    t.poller.stop();
  });

  it("refresh()_立刻抓；請求還在進行時，等它結束再補抓一次", async () => {
    let release: (() => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<PollResult>((resolve) => {
          release = () => resolve({ status: "ok", feed: feed(load.mock.calls.length) });
        }),
    );
    const t = setup(load);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);

    t.poller.refresh();
    t.poller.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.onFeed).toHaveBeenLastCalledWith(feed(2));
    t.poller.stop();
  });

  it("401（session 失效）_停止輪詢並通知", async () => {
    const t = setup(vi.fn(async () => ({ status: "unauthorized" }) as PollResult));
    await vi.advanceTimersByTimeAsync(0);

    expect(t.onUnauthorized).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(POLL_HIDDEN_MS * 3);
    expect(t.load).toHaveBeenCalledTimes(1);
    t.poller.refresh();
    expect(t.load).toHaveBeenCalledTimes(1);
  });

  it("請求失敗（網路斷線、伺服器錯誤）_下一輪照樣再試", async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<PollResult>>().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue({ status: "ok", feed: feed(2) });
    const t = setup(load);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.onFeed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_VISIBLE_MS);
    expect(t.onFeed).toHaveBeenCalledWith(feed(2));
    t.poller.stop();
  });

  it("stop()_取消進行中的請求、不再抓", async () => {
    let signal: AbortSignal | undefined;
    const load = vi.fn((s: AbortSignal) => {
      signal = s;
      return new Promise<PollResult>(() => {});
    });
    const t = setup(load);
    await vi.advanceTimersByTimeAsync(0);

    t.poller.stop();

    expect(signal!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(POLL_HIDDEN_MS * 3);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
