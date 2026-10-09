import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/translation", { spy: true });

const translation = mocksOf(await import("../service/translation"), "continueTranslation", "startTranslation");
const { continueTranslationAction, startTranslationAction } = await import("./actions");
const { ApiKeySetupError, TranslationUserError } = await import("../service/translation");

const VIDEO = "dQw4w9WgXcQ";
const QUEUED = { status: "queued", done: 0, total: 8, error: null, translated: [] };

beforeEach(() => {
  translation.continueTranslation.mockReset().mockResolvedValue(QUEUED);
  translation.startTranslation.mockReset().mockResolvedValue({ ok: true });
});

describe("continueTranslationAction：播放位置", () => {
  it("把目前的播放位置（毫秒）交給續翻，讓伺服器從那裡優先翻", async () => {
    await expect(continueTranslationAction(VIDEO, 12_345)).resolves.toEqual(QUEUED);
    expect(translation.continueTranslation).toHaveBeenCalledWith(TEST_SESSION.id, VIDEO, { positionMs: 12_345 });
  });

  it("沒給或不是正常的毫秒數（Server Action 可以被直接 POST）→ 當成沒有播放位置", async () => {
    for (const bad of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, "60000" as unknown as number]) {
      await continueTranslationAction(VIDEO, bad);
    }
    expect(translation.continueTranslation.mock.calls.every(([, , options]) => options.positionMs === undefined)).toBe(true);
    expect(translation.continueTranslation).toHaveBeenCalledTimes(5);
  });
});

describe("要到「翻譯設定」處理的錯誤", () => {
  it("續翻時沒有 API Key → 標示 needsSettings，畫面附上設定頁連結", async () => {
    translation.continueTranslation.mockRejectedValue(new ApiKeySetupError("還沒設定 Claude 的 API Key，請先到「翻譯設定」填入"));
    await expect(continueTranslationAction(VIDEO, 0)).resolves.toEqual({
      actionError: "還沒設定 Claude 的 API Key，請先到「翻譯設定」填入",
      needsSettings: true,
    });
  });

  it("開始翻譯時沒有 API Key → 標示 needsSettings", async () => {
    translation.startTranslation.mockRejectedValue(new ApiKeySetupError("還沒設定 Claude 的 API Key，請先到「翻譯設定」填入"));
    await expect(startTranslationAction(VIDEO)).resolves.toEqual({
      ok: false,
      message: "還沒設定 Claude 的 API Key，請先到「翻譯設定」填入",
      canUpload: false,
      needsSettings: true,
    });
  });

  it("其他使用者錯誤 → 不標示", async () => {
    translation.continueTranslation.mockRejectedValue(new TranslationUserError("這支影片還沒開始翻譯"));
    translation.startTranslation.mockRejectedValue(new TranslationUserError("影片 ID 格式不正確"));

    await expect(continueTranslationAction(VIDEO, 0)).resolves.toEqual({ actionError: "這支影片還沒開始翻譯" });
    await expect(startTranslationAction(VIDEO)).resolves.toEqual({ ok: false, message: "影片 ID 格式不正確", canUpload: false });
  });
});
