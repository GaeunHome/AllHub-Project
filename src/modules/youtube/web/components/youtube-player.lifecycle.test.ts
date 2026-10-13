import fs from "node:fs";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type DependencyList, type EffectCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// effect 只在瀏覽器跑：直接呼叫元件，state 給初始值、setter 換成替身，effect 收起來自己跑（跑完再跑清除函式，就是卸載或 Activity 把頁面藏起來）
vi.mock("react", { spy: true });

const { YoutubePlayer } = await import("./youtube-player");

const VIDEO = "syncsubs001";
const CUES = [{ start: 1000, end: 2000, text: "안녕" }];
type Events = { onReady(): void; onStateChange(event: { data: number }): void };

/** 假的 YT.Player：時間由測試指定 */
class FakePlayer {
  static last: FakePlayer | undefined;
  time = 0;
  destroy = vi.fn();
  events: Events;
  constructor(_target: unknown, options: { events: Events }) {
    this.events = options.events;
    FakePlayer.last = this;
  }
  getCurrentTime() {
    return this.time;
  }
}

const fakeElement = () => ({ appendChild: vi.fn(), replaceChildren: vi.fn(), setAttribute: vi.fn(), removeAttribute: vi.fn() });
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

type Mounted = {
  /** 依 useState 的順序：字幕、載入失敗、播放中、原生全螢幕、頁內全螢幕 */
  set: { index: ReturnType<typeof vi.fn>; failed: ReturnType<typeof vi.fn>; playing: ReturnType<typeof vi.fn>; native: ReturnType<typeof vi.fn>; pseudo: ReturnType<typeof vi.fn> };
  frame: ReturnType<typeof fakeElement>;
  onPlayingChange: ReturnType<typeof vi.fn>;
  onSizeChange: ReturnType<typeof vi.fn>;
  /** 跑完所有 effect（含 layout effect），回傳清除函式 */
  runEffects: () => (() => void)[];
};

function mount({ pseudo = false } = {}): Mounted {
  const setters: ReturnType<typeof vi.fn>[] = [];
  const effects: { effect: EffectCallback; deps?: DependencyList }[] = [];
  // 前兩個 ref 是外框與放 iframe 的元素
  const elements = [fakeElement(), fakeElement()];
  let refs = 0;
  vi.mocked(useRef).mockImplementation(((initial: unknown) => ({ current: refs < elements.length ? elements[refs++] : initial })) as never);
  vi.mocked(useState).mockImplementation(((initial: unknown) => {
    const set = vi.fn();
    setters.push(set);
    return [setters.length === 5 ? pseudo : initial, set];
  }) as never);
  vi.mocked(useEffect).mockImplementation((effect, deps) => void effects.push({ effect, deps }));
  vi.mocked(useLayoutEffect).mockImplementation((effect, deps) => void effects.push({ effect, deps }));
  vi.mocked(useImperativeHandle).mockImplementation(() => {});
  const onPlayingChange = vi.fn();
  const onSizeChange = vi.fn();

  YoutubePlayer({ videoId: VIDEO, cues: CUES, translated: ["你好"], mode: "both", subtitleSize: "medium", translating: false, size: "default", onSizeChange, onPlayingChange });

  const [index, failed, playing, native, setPseudo] = setters;
  return {
    set: { index, failed, playing, native, pseudo: setPseudo },
    frame: elements[0],
    onPlayingChange,
    onSizeChange,
    runEffects: () => effects.map(({ effect }) => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === "function"),
  };
}

let doc: { hidden: boolean; fullscreenElement: unknown; exitFullscreen: ReturnType<typeof vi.fn>; documentElement: ReturnType<typeof fakeElement>; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; createElement: () => unknown; querySelectorAll: () => unknown[] };
/** 畫面上開著的彈出層（⋮ 選單、鈴鐺面板、人像選單、彈出視窗）；document.querySelectorAll 回傳這些 */
let openPopups: unknown[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  FakePlayer.last = undefined;
  doc = {
    hidden: false,
    fullscreenElement: null,
    exitFullscreen: vi.fn(async () => {}),
    documentElement: fakeElement(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    createElement: () => fakeElement(),
    querySelectorAll: () => openPopups,
  };
  openPopups = [];
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { YT: { Player: FakePlayer }, addEventListener: vi.fn(), removeEventListener: vi.fn(), matchMedia: () => ({ matches: true }) });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const hook of [useRef, useState, useEffect, useLayoutEffect, useImperativeHandle]) vi.mocked(hook).mockReset();
});

describe("播放器卸載或被 Activity 藏起來（例如按上一頁）", () => {
  it("字幕、播放中的樣式回到初始值：再顯示時播放器是重新建立的（從頭開始），不能留著上一次的字幕與「播放中」", async () => {
    const player = mount();
    const cleanups = player.runEffects();
    await flushMicrotasks();
    const yt = FakePlayer.last!;
    yt.time = 1.5;
    yt.events.onReady();
    yt.events.onStateChange({ data: 1 });
    expect(player.set.index).toHaveBeenLastCalledWith(0);
    expect(player.set.playing).toHaveBeenLastCalledWith(true);

    for (const cleanup of cleanups) cleanup();

    expect(yt.destroy).toHaveBeenCalledOnce();
    expect(player.set.index).toHaveBeenLastCalledWith(-1);
    expect(player.set.playing).toHaveBeenLastCalledWith(false);
    expect(player.onPlayingChange).toHaveBeenLastCalledWith(false);
  });

  it("載入失敗的訊息也清掉：再顯示時會重新載入，成功了訊息不能還蓋在播放器上（點不到影片）", () => {
    const player = mount();
    const cleanups = player.runEffects();

    for (const cleanup of cleanups) cleanup();

    expect(player.set.failed).toHaveBeenLastCalledWith(null);
  });

  it("不再推算：逐幀推算、輪詢與監聽都停掉", async () => {
    const player = mount();
    const cleanups = player.runEffects();
    await flushMicrotasks();
    FakePlayer.last!.events.onReady();
    FakePlayer.last!.events.onStateChange({ data: 1 });
    const calls = player.set.index.mock.calls.length;

    for (const cleanup of cleanups) cleanup();
    vi.advanceTimersByTime(1000);

    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(doc.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(doc.removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(player.set.index.mock.calls.length).toBe(calls + 1);
  });

  it("在原生全螢幕：離開全螢幕，回來時按鈕不會還寫著「離開全螢幕」", () => {
    const player = mount();
    doc.fullscreenElement = player.frame;
    const cleanups = player.runEffects();

    for (const cleanup of cleanups) cleanup();

    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(player.set.native).toHaveBeenLastCalledWith(false);
  });

  it("別的元素在全螢幕（不是這個播放器）：不去動它", () => {
    const player = mount();
    doc.fullscreenElement = fakeElement();
    const cleanups = player.runEffects();

    for (const cleanup of cleanups) cleanup();

    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  it("在頁內全螢幕：html 的捲動鎖當場解除（下一頁才捲得動），回來時也不再蓋滿畫面", () => {
    const player = mount({ pseudo: true });
    const cleanups = player.runEffects();
    expect(doc.documentElement.setAttribute).toHaveBeenCalledWith("data-player-fullscreen", "");

    for (const cleanup of cleanups) cleanup();

    expect(doc.documentElement.removeAttribute).toHaveBeenCalledWith("data-player-fullscreen");
    expect(player.set.pseudo).toHaveBeenLastCalledWith(false);
  });

  it("不在頁內全螢幕：不鎖捲動", () => {
    mount().runEffects();

    expect(doc.documentElement.setAttribute).not.toHaveBeenCalled();
  });
});

describe("播放器加在 html 上的規則（globals.css）", () => {
  const css = fs.readFileSync(new URL("../../../../app/globals.css", import.meta.url), "utf8");
  const rule = (selector: string) => new RegExp(`^\\s*${selector.replace(/[.()[\]]/g, "\\$&")} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";

  it("頁內全螢幕的捲動鎖在 html 的屬性上：Activity 藏起來的頁面還留在文件裡，用 :has 比對播放器的 data-fullscreen 會連它一起算，按上一頁後下一頁就捲不動", () => {
    expect(css).not.toMatch(/:has\([^)]*player-frame\[data-fullscreen/);
    expect(rule("html[data-player-fullscreen]")).toMatch(/overflow:\s*hidden/);
  });

  it("原生全螢幕時不保留捲軸的位置：Windows 這類占寬度的捲軸會讓外框少一條、右邊留黑邊，影片也偏一邊", () => {
    expect(rule("html:has(.player-frame:fullscreen)")).toMatch(/scrollbar-gutter:\s*auto/);
  });
});

describe("播放器的快捷鍵：彈出層開著時讓開", () => {
  /** 展開中的 ⋮ 選單觸發按鈕（core 的 popup-layer 認得出來） */
  const openMenu = { tagName: "BUTTON", hasAttribute: (name: string) => name === "data-popup-trigger", getAttribute: (name: string) => (name === "aria-expanded" ? "true" : null), getClientRects: () => ({ length: 1 }) };

  /** 像瀏覽器派送一次按鍵：先跑 window 的捕獲階段，再跑 document 上的 keydown 監聽；between 模擬選單自己的 Esc 監聽先把選單收掉 */
  function press(key: string, between: () => void = () => {}) {
    const event = { key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, isComposing: false, defaultPrevented: false, target: { tagName: "BODY" }, preventDefault: vi.fn() };
    const listeners = (target: { addEventListener: ReturnType<typeof vi.fn> }, capture: boolean) =>
      target.addEventListener.mock.calls.filter(([type, , options]) => type === "keydown" && (options === true) === capture).map(([, listener]) => listener as (e: unknown) => void);
    for (const listener of listeners(window as unknown as { addEventListener: ReturnType<typeof vi.fn> }, true)) listener(event);
    between();
    for (const listener of listeners(doc, false)) listener(event);
  }

  it("沒有彈出層開著：f 切到全螢幕（不支援 Fullscreen API 時是頁內全螢幕）、t 切換劇院模式", () => {
    const player = mount();
    player.runEffects();

    press("f");
    press("t");

    expect(player.set.pseudo).toHaveBeenCalledWith(true);
    expect(player.onSizeChange).toHaveBeenCalledWith("theater");
  });

  it("沒有彈出層開著：頁內全螢幕時按 Esc 離開", () => {
    const player = mount({ pseudo: true });
    player.runEffects();

    press("Escape");

    expect(player.set.pseudo).toHaveBeenCalledWith(false);
  });

  it("⋮ 選單、鈴鐺面板、人像選單或彈出視窗開著：f、t 不作用", () => {
    const player = mount();
    player.runEffects();
    openPopups = [openMenu];

    press("f");
    press("t");

    expect(player.set.pseudo).not.toHaveBeenCalled();
    expect(player.onSizeChange).not.toHaveBeenCalled();
  });

  it("彈出層開著時按 Esc 只關掉彈出層、不離開頁內全螢幕：選單自己的 Esc 監聽先把它收掉也一樣", () => {
    const player = mount({ pseudo: true });
    player.runEffects();
    openPopups = [openMenu];

    press("Escape", () => (openPopups = []));

    expect(player.set.pseudo).not.toHaveBeenCalledWith(false);
  });
});
