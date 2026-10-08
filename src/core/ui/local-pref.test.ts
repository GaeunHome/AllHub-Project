import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalPref } from "./local-pref";

type Size = "small" | "medium" | "large";
const SIZES: string[] = ["small", "medium", "large"];

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

const brokenStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

/** 別的分頁改了 localStorage 時，瀏覽器只在其他分頁觸發 storage 事件；清空時 key 是 null */
const storageEvent = (key: string | null) => Object.assign(new Event("storage"), { key });

const sizePref = () => createLocalPref<Size>({ key: "test:size", defaultValue: "medium", parse: (stored) => (SIZES.includes(stored) ? (stored as Size) : undefined) });

beforeEach(() => vi.stubGlobal("window", new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

describe("createLocalPref：每台裝置各自的偏好", () => {
  it("沒存過、或存的值認不得_用預設值", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(sizePref().read()).toBe("medium");

    vi.stubGlobal("localStorage", fakeStorage({ "test:size": "huge" }));
    expect(sizePref().read()).toBe("medium");
  });

  it("存進 localStorage_重新載入頁面後讀得回來", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);

    sizePref().save("large");

    expect(storage.data.get("test:size")).toBe("large");
    expect(sizePref().read()).toBe("large");
  });

  it("可以自訂存進去的格式", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const pref = createLocalPref({ key: "test:on", defaultValue: true, parse: (v) => (v === "on" ? true : v === "off" ? false : undefined), serialize: (v) => (v ? "on" : "off") });

    pref.save(false);

    expect(storage.data.get("test:on")).toBe("off");
    expect(pref.read()).toBe(false);
  });

  it("localStorage 不能用（隱私模式）_記在這個分頁的記憶體裡，這次瀏覽照樣生效", () => {
    vi.stubGlobal("localStorage", brokenStorage);
    const pref = sizePref();
    expect(pref.read()).toBe("medium");

    pref.save("small");

    expect(pref.read()).toBe("small");
  });

  it("沒存過時改用 fallback（例如沿用舊版的設定）；fallback 回 undefined 才用預設值；存過之後以存的值為準", () => {
    const storage = fakeStorage({ "test:legacy": "small" });
    vi.stubGlobal("localStorage", storage);
    const fromLegacy = () => {
      const legacy = storage.data.get("test:legacy");
      return legacy && SIZES.includes(legacy) ? (legacy as Size) : undefined;
    };
    const pref = createLocalPref<Size>({ key: "test:size", defaultValue: "medium", parse: (stored) => (SIZES.includes(stored) ? (stored as Size) : undefined), fallback: fromLegacy });

    expect(pref.read()).toBe("small");

    storage.data.delete("test:legacy");
    expect(pref.read()).toBe("medium");

    storage.data.set("test:legacy", "small");
    pref.save("large");
    expect(pref.read()).toBe("large");
  });

  it("儲存時通知這個分頁的畫面更新", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const pref = sizePref();
    const listener = vi.fn();
    pref.subscribe(listener);

    pref.save("small");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("別的分頁改了同一個設定或清空_這個分頁讀到新值並通知畫面更新；別的設定變動不理會，取消訂閱後也不再通知", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const pref = sizePref();
    const listener = vi.fn();
    const unsubscribe = pref.subscribe(listener);

    storage.data.set("test:size", "large");
    window.dispatchEvent(storageEvent("other:key"));
    expect(listener).not.toHaveBeenCalled();
    window.dispatchEvent(storageEvent("test:size"));
    expect(listener).toHaveBeenCalledOnce();
    expect(pref.read()).toBe("large");
    window.dispatchEvent(storageEvent(null));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(storageEvent("test:size"));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
