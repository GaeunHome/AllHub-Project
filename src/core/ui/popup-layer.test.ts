import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../auth/actions", () => ({ logout: vi.fn() }));

const { POPUP_TRIGGER, isOpenPopup, listenPageKeys, popupLayerOpen } = await import("./popup-layer");
const { MoreMenu } = await import("./more-menu");
const { HeaderMenus } = await import("./header-menus");
const { AccountMenu } = await import("./account-menu");
const { NotificationBell } = await import("../notifications/bell");

type FakeOptions = { tag?: string; attributes?: Record<string, string>; shown?: boolean };

/** 只有判斷需要的幾個方法的假元素；shown 為 false 代表在 Activity 藏起來的頁面裡（display: none，沒有版面） */
function fakeElement({ tag = "BUTTON", attributes = {}, shown = true }: FakeOptions = {}) {
  return {
    tagName: tag,
    hasAttribute: (name: string) => name in attributes,
    getAttribute: (name: string) => attributes[name] ?? null,
    getClientRects: () => ({ length: shown ? 1 : 0 }),
  };
}

const fakeRoot = (...elements: ReturnType<typeof fakeElement>[]) => ({ querySelectorAll: () => elements });

describe("isOpenPopup：認得出開著的彈出層", () => {
  it("開著的彈出視窗（<dialog open>）算；關著的不算", () => {
    expect(isOpenPopup(fakeElement({ tag: "DIALOG", attributes: { open: "" } }))).toBe(true);
    expect(isOpenPopup(fakeElement({ tag: "DIALOG" }))).toBe(false);
  });

  it("人像選單（aria-haspopup=menu）、鈴鐺（aria-haspopup=dialog）展開時算；收起時不算", () => {
    expect(isOpenPopup(fakeElement({ attributes: { "aria-haspopup": "menu", "aria-expanded": "true" } }))).toBe(true);
    expect(isOpenPopup(fakeElement({ attributes: { "aria-haspopup": "dialog", "aria-expanded": "true" } }))).toBe(true);
    expect(isOpenPopup(fakeElement({ attributes: { "aria-haspopup": "menu", "aria-expanded": "false" } }))).toBe(false);
  });

  it("⋮ 選單的面板是 group（aria-haspopup 沒有對應的值）：觸發按鈕標上 core 的屬性，展開時也算", () => {
    expect(isOpenPopup(fakeElement({ attributes: { [POPUP_TRIGGER]: "", "aria-expanded": "true" } }))).toBe(true);
    expect(isOpenPopup(fakeElement({ attributes: { [POPUP_TRIGGER]: "", "aria-expanded": "false" } }))).toBe(false);
  });

  it("只是展開下方區塊的按鈕（觀看頁的「上傳字幕」：有 aria-expanded、沒宣告彈出層）不算；aria-haspopup=false 也不算", () => {
    expect(isOpenPopup(fakeElement({ attributes: { "aria-expanded": "true" } }))).toBe(false);
    expect(isOpenPopup(fakeElement({ attributes: { "aria-haspopup": "false", "aria-expanded": "true" } }))).toBe(false);
  });

  it("Activity 藏起來的頁面還留在文件裡：裡面展開著的按鈕、開著的視窗都不算，不會擋住現在這一頁的快捷鍵", () => {
    expect(isOpenPopup(fakeElement({ attributes: { [POPUP_TRIGGER]: "", "aria-expanded": "true" }, shown: false }))).toBe(false);
    expect(isOpenPopup(fakeElement({ tag: "DIALOG", attributes: { open: "" }, shown: false }))).toBe(false);
  });
});

describe("popupLayerOpen：畫面上有沒有彈出層開著", () => {
  it("有一個開著就是 true；都沒開（或只有展開的區塊）是 false", () => {
    const section = fakeElement({ attributes: { "aria-expanded": "true" } });
    const menu = fakeElement({ attributes: { [POPUP_TRIGGER]: "", "aria-expanded": "true" } });

    expect(popupLayerOpen(fakeRoot(section, menu))).toBe(true);
    expect(popupLayerOpen(fakeRoot(section))).toBe(false);
    expect(popupLayerOpen(fakeRoot())).toBe(false);
  });
});

type Listener = (event: Event) => void;

/** 記下監聽的假 window／document：dispatch 依序跑 window 的捕獲階段與 document 的冒泡階段，中間可以插入別的元件的 document 監聽 */
function fakeTargets(root: ReturnType<typeof fakeRoot>) {
  const listeners: { target: "window" | "document"; listener: Listener; capture: boolean }[] = [];
  const target = (name: "window" | "document") => ({
    addEventListener: (_type: string, listener: Listener, capture?: boolean) => void listeners.push({ target: name, listener, capture: capture === true }),
    removeEventListener: (_type: string, listener: Listener, capture?: boolean) => {
      const index = listeners.findIndex((l) => l.target === name && l.listener === listener && l.capture === (capture === true));
      if (index >= 0) listeners.splice(index, 1);
    },
  });
  const run = (filter: (l: (typeof listeners)[number]) => boolean, event: Event) => listeners.filter(filter).forEach((l) => l.listener(event));
  return {
    listeners,
    win: target("window"),
    doc: { ...target("document"), querySelectorAll: root.querySelectorAll },
    dispatch(event: Event, between: () => void = () => {}) {
      run((l) => l.target === "window" && l.capture, event);
      // 例如 ⋮ 選單自己掛在 document 上的 Esc 監聽先跑、把選單收起來
      between();
      run((l) => l.target === "document" && !l.capture, event);
    },
  };
}

describe("listenPageKeys：頁面自己的快捷鍵讓給彈出層", () => {
  const key = { key: "Escape" } as KeyboardEvent;

  it("沒有彈出層開著：按鍵交給頁面", () => {
    const targets = fakeTargets(fakeRoot());
    const onKey = vi.fn();
    listenPageKeys(onKey, targets);

    targets.dispatch(key);

    expect(onKey).toHaveBeenCalledWith(key);
  });

  it("按下的當下有彈出層開著：不交給頁面，就算選單自己的 Esc 監聽先把它收起來（冒泡到 document 時已經看不出來）也一樣", () => {
    const elements = [fakeElement({ attributes: { [POPUP_TRIGGER]: "", "aria-expanded": "true" } })];
    const targets = fakeTargets({ querySelectorAll: () => elements });
    const onKey = vi.fn();
    listenPageKeys(onKey, targets);

    targets.dispatch(key, () => elements.splice(0));

    expect(onKey).not.toHaveBeenCalled();
  });

  it("彈出層關掉之後的下一次按鍵照常交給頁面", () => {
    const elements = [fakeElement({ tag: "DIALOG", attributes: { open: "" } })];
    const targets = fakeTargets({ querySelectorAll: () => elements });
    const onKey = vi.fn();
    listenPageKeys(onKey, targets);

    targets.dispatch(key, () => elements.splice(0));
    targets.dispatch(key);

    expect(onKey).toHaveBeenCalledOnce();
  });

  it("回傳的函式把兩個監聽都拿掉", () => {
    const targets = fakeTargets(fakeRoot());
    const stop = listenPageKeys(vi.fn(), targets);
    expect(targets.listeners).toHaveLength(2);

    stop();

    expect(targets.listeners).toHaveLength(0);
  });
});

describe("觸發按鈕都宣告了自己會打開彈出層（popupLayerOpen 靠這些屬性認）", () => {
  const triggerOf = (markup: string, label: string) => [...markup.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`aria-label="${label}"`));

  it("⋮ 選單：面板是 group 不是 menu，不宣稱 aria-haspopup，改標 core 的屬性", () => {
    const trigger = triggerOf(renderToStaticMarkup(createElement(MoreMenu, { label: "影片的選項" } as Parameters<typeof MoreMenu>[0])), "影片的選項");

    expect(trigger).toContain(`${POPUP_TRIGGER}=""`);
    expect(trigger).not.toContain("aria-haspopup");
    expect(trigger).toContain('aria-expanded="false"');
  });

  it("鈴鐺：面板是 role=dialog，宣告 aria-haspopup=dialog", () => {
    const trigger = triggerOf(renderToStaticMarkup(createElement(HeaderMenus, null, createElement(NotificationBell))), "通知");

    expect(trigger).toContain('aria-haspopup="dialog"');
    expect(trigger).toContain('aria-expanded="false"');
  });

  it("人像選單：面板是 role=menu，宣告 aria-haspopup=menu", () => {
    const trigger = triggerOf(renderToStaticMarkup(createElement(HeaderMenus, null, createElement(AccountMenu, { username: "alice" }))), "帳號");

    expect(trigger).toContain('aria-haspopup="menu"');
    expect(trigger).toContain('aria-expanded="false"');
  });
});
