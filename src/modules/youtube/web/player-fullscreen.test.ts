import { describe, expect, it, vi } from "vitest";
import { fullscreenMode, fullscreenToggle, leaveFullscreen, lockPageScroll } from "./player-fullscreen";

describe("全螢幕：瀏覽器支援時用真的全螢幕，iPhone 這類不支援的改用頁內全螢幕", () => {
  it("瀏覽器支援 Fullscreen API：進入真的全螢幕；已經在全螢幕就離開", () => {
    expect(fullscreenToggle("off", true)).toBe("enter-native");
    expect(fullscreenToggle("native", true)).toBe("exit-native");
  });

  it("不支援（iPhone Safari 的 document.fullscreenEnabled 是 false）：改用頁內全螢幕，再按一次離開", () => {
    expect(fullscreenToggle("off", false)).toBe("enter-pseudo");
    expect(fullscreenToggle("pseudo", false)).toBe("exit-pseudo");
  });

  it("頁內全螢幕中（真的全螢幕被拒絕而退回的）一律離開頁內全螢幕", () => {
    expect(fullscreenToggle("pseudo", true)).toBe("exit-pseudo");
  });

  it("目前的狀態：真的全螢幕優先，其次是頁內全螢幕", () => {
    expect(fullscreenMode({ native: true, pseudo: false })).toBe("native");
    expect(fullscreenMode({ native: true, pseudo: true })).toBe("native");
    expect(fullscreenMode({ native: false, pseudo: true })).toBe("pseudo");
    expect(fullscreenMode({ native: false, pseudo: false })).toBe("off");
  });
});

describe("離開頁面時（卸載、Activity 把頁面藏起來）", () => {
  it("頁內全螢幕的捲動鎖記在 html 的屬性上，回傳的函式解除", () => {
    const root = { setAttribute: vi.fn(), removeAttribute: vi.fn() };

    const unlock = lockPageScroll(root);
    expect(root.setAttribute).toHaveBeenCalledWith("data-player-fullscreen", "");
    unlock();

    expect(root.removeAttribute).toHaveBeenCalledWith("data-player-fullscreen");
  });

  it("這個播放器在原生全螢幕才離開；瀏覽器拒絕也不丟錯", async () => {
    const frame = {} as Element;
    const exitFullscreen = vi.fn(async () => Promise.reject(new Error("not allowed")));

    leaveFullscreen({ fullscreenElement: null, exitFullscreen }, frame);
    leaveFullscreen({ fullscreenElement: {} as Element, exitFullscreen }, frame);
    expect(exitFullscreen).not.toHaveBeenCalled();

    leaveFullscreen({ fullscreenElement: frame, exitFullscreen }, frame);
    expect(exitFullscreen).toHaveBeenCalledOnce();
    await Promise.resolve();
  });
});
