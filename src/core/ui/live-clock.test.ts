import { createElement, useSyncExternalStore } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 模擬瀏覽器裡的算繪 useSyncExternalStore 換成回傳指定的整秒
// 其他照原本的實作
vi.mock("react", { spy: true });

const { LiveClock, currentSecond, subscribeSecond } = await import("./live-clock");

// 台北 2026/10/7 12:00:00 是 UTC 04:00:00
const NOON = Date.UTC(2026, 9, 7, 4, 0, 0);
const MINUTE = 60_000;

type Page = EventTarget & { visibilityState: DocumentVisibilityState };
let page: Page;
let unsubscribers: (() => void)[] = [];

/** 一個訂閱者 像掛在畫面上的時鐘 測試結束一律取消 模組裡的計時器才不會留到下一個測試 */
function watch() {
  const listener = vi.fn();
  unsubscribers.push(subscribeSecond(listener));
  return listener;
}

/** 切換分頁時瀏覽器先改 visibilityState 再發 visibilitychange */
function setVisibility(state: DocumentVisibilityState) {
  page.visibilityState = state;
  page.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  page = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  vi.stubGlobal("document", page);
});

afterEach(() => {
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(useSyncExternalStore).mockReset();
});

describe("時鐘的計時（所有時鐘共用一個計時器）", () => {
  it("第一個時鐘掛上時馬上讀到現在這一秒；之後在下一個整秒換秒，不是從掛上那一刻起算一秒", () => {
    vi.setSystemTime(NOON + 300);
    expect(currentSecond()).toBeNull();

    const listener = watch();
    expect(currentSecond()).toBe(NOON);
    listener.mockClear();

    vi.advanceTimersByTime(699);
    expect(currentSecond()).toBe(NOON);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(currentSecond()).toBe(NOON + 1000);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("計時器每次都晚到（主執行緒忙、分頁被節流）也不會越走越慢：每次都重新對準下一個整秒", () => {
    watch();

    for (let i = 1; i <= 30; i++) {
      // 時間往前走了計時器卻還沒觸發 這一次會晚 40ms 才到
      vi.setSystemTime(Date.now() + 40);
      vi.advanceTimersToNextTimer();

      expect(Date.now() - NOON).toBe(i * 1000 + 40);
      expect(currentSecond()).toBe(NOON + i * 1000);
    }
  });

  it("同時有好幾個時鐘也只有一個計時器；最後一個離開（卸載、Activity 藏起來）才停，停了就不再更新、讀到 null", () => {
    const leaveFirst = subscribeSecond(vi.fn());
    const listener = vi.fn();
    const leaveSecond = subscribeSecond(listener);
    expect(vi.getTimerCount()).toBe(1);

    leaveFirst();
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    leaveSecond();
    expect(vi.getTimerCount()).toBe(0);
    expect(currentSecond()).toBeNull();

    // 停了之後切換分頁也不會重新開始
    setVisibility("hidden");
    setVisibility("visible");
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(currentSecond()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("回到前景時立刻對時，不等被節流的計時器；舊的計時器換掉，不會變成兩個", () => {
    const listener = watch();
    setVisibility("hidden");
    // 在背景五分鐘 時間往前走了 被節流的計時器還沒觸發
    vi.setSystemTime(NOON + 5 * MINUTE + 300);
    expect(currentSecond()).toBe(NOON);
    listener.mockClear();

    setVisibility("visible");

    expect(currentSecond()).toBe(NOON + 5 * MINUTE);
    expect(listener).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(699);
    expect(currentSecond()).toBe(NOON + 5 * MINUTE);
    vi.advanceTimersByTime(1);
    expect(currentSecond()).toBe(NOON + 5 * MINUTE + 1000);
  });
});

describe("伺服器算繪（含預先算繪）", () => {
  it("只放預留的位置、不放真的時間：預先算繪的 HTML 之後任何時候都可能被拿去用", () => {
    vi.setSystemTime(NOON + 5000);
    // 同一個程序裡已經有時鐘在走 伺服器算繪也不能拿來用
    watch();

    const markup = renderToStaticMarkup(createElement(LiveClock));

    expect(markup).not.toContain("12:00:05");
    expect(markup).not.toContain("<time");
    expect(markup).toContain(">00:00:00<");
    expect(markup).toMatch(/^<span aria-hidden="true"/);
  });
});

describe("瀏覽器裡的時鐘", () => {
  /**
   * 在瀏覽器裡算繪 useSyncExternalStore 回傳指定的整秒
   * null 是時鐘還沒開始走 跟 hydration 時一樣
   */
  function renderAt(second: number | null) {
    vi.mocked(useSyncExternalStore).mockReturnValue(second);
    return renderToStaticMarkup(createElement(LiveClock));
  }

  it("顯示台北時間的時分秒，用 <time> 標上機器讀得懂的時間；報讀器念「台北時間」加時間，滑鼠移上去也看得到「台北時間」", () => {
    // 台北 2026/10/8 00:05:09 午夜的時是 00
    const markup = renderAt(Date.UTC(2026, 9, 7, 16, 5, 9));

    expect(markup).toMatch(/^<time [^>]*datetime="2026-10-07T16:05:09\.000Z"/i);
    expect(markup).toMatch(/^<time [^>]*title="台北時間"/);
    expect(markup).toMatch(/<span class="sr-only">台北時間 <\/span>00:05:09<\/time>$/);
  });

  it("不是 live region：報讀器不會每秒念一次", () => {
    const markup = renderAt(NOON);

    expect(markup).toContain("12:00:00");
    expect(markup).not.toMatch(/aria-live|aria-atomic|aria-busy|role="(?:status|timer|log|alert|marquee)"/);
  });

  it("預留的位置跟真的時間一樣寬：同樣的排版 class（含等寬數字 tabular-nums）、同樣的圖示、同樣八個字，換上時間時旁邊的東西不會跳", () => {
    const placeholder = renderAt(null);
    const clock = renderAt(NOON);
    const outerClasses = (markup: string) => (markup.match(/^<\w+ [^>]*class="([^"]*)"/)?.[1] ?? "").split(" ").filter((c) => c !== "invisible").sort();
    const icons = (markup: string) => markup.match(/<span class="icon[^"]*"/g);
    const visibleText = (markup: string) => markup.replace(/<span class="sr-only">.*?<\/span>/, "").replace(/<[^>]+>/g, "");

    expect(placeholder).toMatch(/^<span [^>]*class="[^"]*\binvisible\b/);
    expect(outerClasses(clock)).toContain("tabular-nums");
    expect(outerClasses(placeholder)).toEqual(outerClasses(clock));
    expect(icons(clock)).toHaveLength(1);
    expect(icons(placeholder)).toEqual(icons(clock));
    expect(visibleText(placeholder)).toBe("00:00:00");
    expect(visibleText(clock)).toBe("12:00:00");
  });
});
