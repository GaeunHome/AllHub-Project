import { afterEach, describe, expect, it, vi } from "vitest";
import { readSubtitleSize, saveSubtitleSize } from "./subtitle-size";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

afterEach(() => vi.unstubAllGlobals());

describe("字幕大小偏好", () => {
  it("沒存過、或存的值認不得_用「中」", () => {
    vi.stubGlobal("localStorage", fakeStorage({ "allhub:youtube:subtitle-size": "huge" }));

    expect(readSubtitleSize()).toBe("medium");
  });

  it("存進 localStorage；別的分頁改了大小，這個分頁讀到新的值，不必重新整理", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);

    saveSubtitleSize("large");
    expect(storage.data.get("allhub:youtube:subtitle-size")).toBe("large");

    storage.data.set("allhub:youtube:subtitle-size", "small");
    expect(readSubtitleSize()).toBe("small");
  });
});
