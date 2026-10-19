import { describe, expect, it, vi } from "vitest";
import { fakeStorage } from "@/dev/fake-storage";
import { readAutoTranslate, shouldAutoContinue, shouldAutoStart } from "./auto-translate";

describe("自動即時翻譯開關", () => {
  it("沒存過 → 預設開啟", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(readAutoTranslate()).toBe(true);
  });
});

describe("shouldAutoStart：按下播放時要不要自動開始翻譯", () => {
  const ready = { enabled: true, hasTranslation: false, apiKeyMissing: false, attempted: false, pending: false };

  it("開關開著、這支影片還沒翻譯、有 API Key → 開始", () => {
    expect(shouldAutoStart(ready)).toBe(true);
  });

  it("開關關掉、已經有翻譯紀錄、沒有 API Key、正在抓字幕或這次已經試過（例如抓不到字幕）→ 不自動開始", () => {
    expect(shouldAutoStart({ ...ready, enabled: false })).toBe(false);
    expect(shouldAutoStart({ ...ready, hasTranslation: true })).toBe(false);
    expect(shouldAutoStart({ ...ready, apiKeyMissing: true })).toBe(false);
    expect(shouldAutoStart({ ...ready, pending: true })).toBe(false);
    expect(shouldAutoStart({ ...ready, attempted: true })).toBe(false);
  });
});

describe("shouldAutoContinue：打開觀看頁時要不要自動用觀看者的 API Key 接著翻", () => {
  const own = { active: true, apiKeyMissing: false, startedByViewer: true, consented: false };

  it("自己發起、還沒翻完、有 API Key → 自動接著翻（維持原本的行為）", () => {
    expect(shouldAutoContinue(own)).toBe(true);
  });

  it("別人發起（或發起人已刪除帳號）、還沒翻完 → 不自動接著翻（「自動即時翻譯」開著也一樣），只顯示已經翻好的部分", () => {
    expect(shouldAutoContinue({ ...own, startedByViewer: false })).toBe(false);
  });

  it("別人發起的翻譯_觀看者按了「用我的 API Key 繼續翻譯」→ 接著翻", () => {
    expect(shouldAutoContinue({ ...own, startedByViewer: false, consented: true })).toBe(true);
  });

  it("已經翻完或失敗、沒有 API Key → 不接著翻", () => {
    expect(shouldAutoContinue({ ...own, active: false })).toBe(false);
    expect(shouldAutoContinue({ ...own, apiKeyMissing: true })).toBe(false);
    expect(shouldAutoContinue({ ...own, startedByViewer: false, consented: true, apiKeyMissing: true })).toBe(false);
  });
});
