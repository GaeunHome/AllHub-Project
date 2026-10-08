import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

/** 別的分頁改了 localStorage 時，瀏覽器只在其他分頁觸發 storage 事件 */
const storageEvent = (key: string | null) => Object.assign(new Event("storage"), { key });

// prefs 會記住建立過的偏好，每個測試重新載入，才不會沿用上一個測試的狀態
async function loadPrefs(initial: Record<string, string> = {}) {
  const storage = fakeStorage(initial);
  vi.stubGlobal("localStorage", storage);
  vi.resetModules();
  return { storage, ...(await import("./prefs")) };
}

beforeEach(() => vi.stubGlobal("window", new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

describe("提醒方式依模組分開設定（存在這台裝置的瀏覽器）", () => {
  it("預設全開", async () => {
    const { readAlertPref } = await loadPrefs();

    expect(readAlertPref("twitch", "sound")).toBe(true);
    expect(readAlertPref("youtube", "browser")).toBe(true);
  });

  it("每個模組各自存：關掉 YouTube 的提示音，不影響 Twitch，也不影響 YouTube 的瀏覽器通知", async () => {
    const { storage, readAlertPref, setAlertPref } = await loadPrefs();

    setAlertPref("youtube", "sound", false);

    expect(readAlertPref("youtube", "sound")).toBe(false);
    expect(readAlertPref("youtube", "browser")).toBe(true);
    expect(readAlertPref("twitch", "sound")).toBe(true);
    expect(storage.data.get("allhub:notifications:sound:youtube")).toBe("off");
  });

  it("舊版的全域開關是關的_還沒個別設定的模組沿用舊值（更新後不會突然響起來）", async () => {
    const { readAlertPref } = await loadPrefs({ "allhub:notifications:sound": "off", "allhub:notifications:browser": "off" });

    expect(readAlertPref("twitch", "sound")).toBe(false);
    expect(readAlertPref("youtube", "browser")).toBe(false);
    expect(readAlertPref("starrail", "sound")).toBe(false);
  });

  it("舊版的全域開關是關的_已經個別設定的模組以個別設定為準", async () => {
    const { readAlertPref, setAlertPref } = await loadPrefs({ "allhub:notifications:sound": "off" });

    setAlertPref("twitch", "sound", true);

    expect(readAlertPref("twitch", "sound")).toBe(true);
    expect(readAlertPref("youtube", "sound")).toBe(false);
    expect(readAlertPref("twitch", "browser")).toBe(true);
  });

  it("舊版的全域開關是開的_跟預設一樣全開", async () => {
    const { readAlertPref } = await loadPrefs({ "allhub:notifications:sound": "on", "allhub:notifications:browser": "on" });

    expect(readAlertPref("twitch", "sound")).toBe(true);
    expect(readAlertPref("twitch", "browser")).toBe(true);
  });

  it("別的分頁改了其中一個模組的設定_這個分頁收到通知並讀到新值；別的種類的變動不理會", async () => {
    const { storage, readAlertPref, subscribeAlertPrefs } = await loadPrefs();
    const listener = vi.fn();
    const unsubscribe = subscribeAlertPrefs(["twitch", "youtube"], "browser", listener);

    storage.data.set("allhub:notifications:sound:youtube", "off");
    window.dispatchEvent(storageEvent("allhub:notifications:sound:youtube"));
    expect(listener).not.toHaveBeenCalled();

    storage.data.set("allhub:notifications:browser:youtube", "off");
    window.dispatchEvent(storageEvent("allhub:notifications:browser:youtube"));
    expect(listener).toHaveBeenCalledOnce();
    expect(readAlertPref("youtube", "browser")).toBe(false);

    unsubscribe();
    window.dispatchEvent(storageEvent("allhub:notifications:browser:twitch"));
    expect(listener).toHaveBeenCalledOnce();
  });

  it("anyAlertPref_任何一個模組開著就是 true，全部關掉才是 false", async () => {
    const { anyAlertPref, setAlertPref } = await loadPrefs();

    expect(anyAlertPref(["twitch", "youtube"], "browser")).toBe(true);
    setAlertPref("twitch", "browser", false);
    expect(anyAlertPref(["twitch", "youtube"], "browser")).toBe(true);
    setAlertPref("youtube", "browser", false);
    expect(anyAlertPref(["twitch", "youtube"], "browser")).toBe(false);
    expect(anyAlertPref([], "browser")).toBe(false);
  });
});
