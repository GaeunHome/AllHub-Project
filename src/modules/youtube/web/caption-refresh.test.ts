import { describe, expect, it } from "vitest";
import { CAPTION_REFRESH_DELAY_MS, CAPTION_REFRESH_LIMIT, shouldRefreshForCaptions } from "./caption-refresh";

describe("清單上還有從沒檢查過字幕的影片時，過幾秒自動重新整理一次", () => {
  it("約 4 秒後重新整理，連續最多 3 次", () => {
    expect(CAPTION_REFRESH_DELAY_MS).toBe(4_000);
    expect(CAPTION_REFRESH_LIMIT).toBe(3);
  });

  it.each([0, 1, 2])("分頁看得到、上一次已經回來、已經刷了 %i 次_排下一次", (refreshed) => {
    expect(shouldRefreshForCaptions({ visible: true, refreshing: false, refreshed })).toBe(true);
  });

  it("連續刷滿 3 次還在檢查（例如一直被擋或影片很多）_不再自動重新整理", () => {
    expect(shouldRefreshForCaptions({ visible: true, refreshing: false, refreshed: 3 })).toBe(false);
  });

  it("分頁看不到_不重新整理（切回來才排）", () => {
    expect(shouldRefreshForCaptions({ visible: false, refreshing: false, refreshed: 0 })).toBe(false);
  });

  it("上一次重新整理還沒回來_不疊上第二次", () => {
    expect(shouldRefreshForCaptions({ visible: true, refreshing: true, refreshed: 1 })).toBe(false);
  });
});
