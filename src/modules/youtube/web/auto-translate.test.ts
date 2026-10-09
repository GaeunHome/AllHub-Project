import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 每個測試重新載入模組，記憶體裡的快取才不會帶到下一個測試 */
const load = () => import("./auto-translate");

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("自動即時翻譯開關", () => {
  it("沒存過 → 預設開啟", async () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect((await load()).readAutoTranslate()).toBe(true);
  });

  it("關掉後存進 localStorage，重新載入頁面仍是關的", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    (await load()).saveAutoTranslate(false);

    vi.resetModules();
    expect((await load()).readAutoTranslate()).toBe(false);
    expect([...storage.data.values()]).toEqual(["off"]);
  });

  it("讀寫 localStorage 失敗（隱私模式）→ 預設開啟，切換仍在這次瀏覽生效", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    });
    const preference = await load();
    expect(preference.readAutoTranslate()).toBe(true);

    preference.saveAutoTranslate(false);
    expect(preference.readAutoTranslate()).toBe(false);
  });
});

describe("跨分頁同步", () => {
  it("別的分頁改了開關_這個分頁讀到新的值，不必重新整理", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const preference = await load();
    expect(preference.readAutoTranslate()).toBe(true);

    storage.data.set("allhub:youtube:auto-translate", "off");

    expect(preference.readAutoTranslate()).toBe(false);
  });
});

describe("shouldAutoStart：按下播放時要不要自動開始翻譯", () => {
  const ready = { enabled: true, hasTranslation: false, apiKeyMissing: false, attempted: false, pending: false };

  it("開關開著、這支影片還沒翻譯、有 API Key → 開始", async () => {
    expect((await load()).shouldAutoStart(ready)).toBe(true);
  });

  it("開關關掉、已經有翻譯紀錄、沒有 API Key、正在抓字幕或這次已經試過（例如抓不到字幕）→ 不自動開始", async () => {
    const { shouldAutoStart } = await load();
    expect(shouldAutoStart({ ...ready, enabled: false })).toBe(false);
    expect(shouldAutoStart({ ...ready, hasTranslation: true })).toBe(false);
    expect(shouldAutoStart({ ...ready, apiKeyMissing: true })).toBe(false);
    expect(shouldAutoStart({ ...ready, pending: true })).toBe(false);
    expect(shouldAutoStart({ ...ready, attempted: true })).toBe(false);
  });
});

describe("shouldAutoContinue：打開觀看頁時要不要自動用觀看者的 API Key 接著翻", () => {
  const own = { active: true, apiKeyMissing: false, startedByViewer: true, consented: false };

  it("自己發起、還沒翻完、有 API Key → 自動接著翻（維持原本的行為）", async () => {
    expect((await load()).shouldAutoContinue(own)).toBe(true);
  });

  it("別人發起（或發起人已刪除帳號）、還沒翻完 → 不自動接著翻（「自動即時翻譯」開著也一樣），只顯示已經翻好的部分", async () => {
    expect((await load()).shouldAutoContinue({ ...own, startedByViewer: false })).toBe(false);
  });

  it("別人發起的翻譯_觀看者按了「用我的 API Key 繼續翻譯」→ 接著翻", async () => {
    expect((await load()).shouldAutoContinue({ ...own, startedByViewer: false, consented: true })).toBe(true);
  });

  it("已經翻完或失敗、沒有 API Key → 不接著翻", async () => {
    const { shouldAutoContinue } = await load();
    expect(shouldAutoContinue({ ...own, active: false })).toBe(false);
    expect(shouldAutoContinue({ ...own, apiKeyMissing: true })).toBe(false);
    expect(shouldAutoContinue({ ...own, startedByViewer: false, consented: true, apiKeyMissing: true })).toBe(false);
  });
});
