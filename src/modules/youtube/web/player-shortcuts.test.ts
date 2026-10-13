import { describe, expect, it } from "vitest";
import { playerShortcut, type ShortcutEvent } from "./player-shortcuts";

const key = (value: string, extra: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
  key: value,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  target: { tagName: "BODY" } as unknown as EventTarget,
  ...extra,
});
const on = (element: Record<string, unknown>) => element as unknown as EventTarget;

describe("playerShortcut：觀看頁的快捷鍵，焦點在輸入框時不搶", () => {
  it("f 切換全螢幕、t 切換劇院模式，大小寫都可以", () => {
    expect(playerShortcut(key("f"))).toBe("fullscreen");
    expect(playerShortcut(key("F"))).toBe("fullscreen");
    expect(playerShortcut(key("t"))).toBe("theater");
    expect(playerShortcut(key("T"))).toBe("theater");
  });

  it("Esc 是離開（頁內全螢幕要自己處理；原生全螢幕由瀏覽器離開）", () => {
    expect(playerShortcut(key("Escape"))).toBe("exit");
  });

  it("按著 Ctrl、⌘、Alt 時不算：留給瀏覽器與系統的快捷鍵（例如 ⌘F 搜尋）", () => {
    expect(playerShortcut(key("f", { metaKey: true }))).toBeNull();
    expect(playerShortcut(key("f", { ctrlKey: true }))).toBeNull();
    expect(playerShortcut(key("t", { altKey: true }))).toBeNull();
  });

  it("按住不放的重複按鍵不算，全螢幕才不會一直開開關關", () => {
    expect(playerShortcut(key("f", { repeat: true }))).toBeNull();
  });

  it("在輸入框、多行文字、下拉選單、可編輯的區塊裡打字不算；注音、倉頡組字中也不算", () => {
    expect(playerShortcut(key("f", { target: on({ tagName: "INPUT", type: "text" }) }))).toBeNull();
    expect(playerShortcut(key("f", { target: on({ tagName: "INPUT", type: "search" }) }))).toBeNull();
    expect(playerShortcut(key("f", { target: on({ tagName: "TEXTAREA" }) }))).toBeNull();
    expect(playerShortcut(key("t", { target: on({ tagName: "SELECT" }) }))).toBeNull();
    expect(playerShortcut(key("t", { target: on({ tagName: "DIV", isContentEditable: true }) }))).toBeNull();
    expect(playerShortcut(key("f", { isComposing: true }))).toBeNull();
  });

  it("焦點在勾選框、開關、按鈕上照樣可以用（沒有在打字）", () => {
    expect(playerShortcut(key("f", { target: on({ tagName: "INPUT", type: "checkbox" }) }))).toBe("fullscreen");
    expect(playerShortcut(key("t", { target: on({ tagName: "BUTTON" }) }))).toBe("theater");
  });

  it("其他按鍵、已經被別的元件處理掉的事件不算", () => {
    expect(playerShortcut(key("k"))).toBeNull();
    expect(playerShortcut(key(" "))).toBeNull();
    expect(playerShortcut(key("f", { defaultPrevented: true }))).toBeNull();
  });
});
