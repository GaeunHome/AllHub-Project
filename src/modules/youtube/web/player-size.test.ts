import { describe, expect, it, vi } from "vitest";
import { brokenStorage, fakeStorage } from "@/dev/fake-storage";
import { PLAYER_SIZE_INIT_SCRIPT, THEATER_ATTRIBUTE, applyPlayerSize, readPlayerSize, savePlayerSize } from "./player-size";

describe("播放器大小偏好（一般／劇院模式）", () => {
  it("沒存過、或存的值認不得_用一般大小", () => {
    vi.stubGlobal("localStorage", fakeStorage({ "allhub:youtube:player-size": "huge" }));

    expect(readPlayerSize()).toBe("default");
  });
});

/** 只記錄屬性的假 <html> */
function fakeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  };
}

/** 在假的 localStorage 與 document 上執行觀看頁開頭的同步腳本 回傳 <html> 的屬性 */
function runInitScript(storage: { getItem(key: string): string | null }) {
  const root = fakeRoot();
  new Function("localStorage", "document", PLAYER_SIZE_INIT_SCRIPT)(storage, { documentElement: root });
  return root.attributes;
}

describe("整頁載入的同步腳本：React 接手前就在 html 標上劇院模式（伺服器讀不到存在瀏覽器的偏好）", () => {
  it("存的是劇院模式_標上屬性；讀的是 savePlayerSize 存的那個 key", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    savePlayerSize("theater");

    expect(runInitScript(storage).has(THEATER_ATTRIBUTE)).toBe(true);
  });

  it.each([
    ["一般大小", "default"],
    ["還沒存過", undefined],
    ["認不得的值", "<script>"],
  ])("%s_不標（第一次繪製不能先閃一下劇院模式）", (_name, stored) => {
    const storage = fakeStorage(stored === undefined ? {} : { "allhub:youtube:player-size": stored });

    expect(runInitScript(storage).has(THEATER_ATTRIBUTE)).toBe(false);
  });

  it("localStorage 不能用（隱私模式）_不丟例外，維持一般大小", () => {
    expect(runInitScript(brokenStorage).has(THEATER_ATTRIBUTE)).toBe(false);
  });
});

describe("applyPlayerSize：React 接手後讓 html 的屬性跟著偏好", () => {
  it("劇院模式標上、一般大小拿掉", () => {
    const root = fakeRoot();

    applyPlayerSize(root, "theater");
    expect(root.attributes.has(THEATER_ATTRIBUTE)).toBe(true);

    applyPlayerSize(root, "default");
    expect(root.attributes.has(THEATER_ATTRIBUTE)).toBe(false);
  });
});
