import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/settings", { spy: true });

const { WeatherUserError } = await import("../service/errors");
const settings = mocksOf(await import("../service/settings"), "saveSettings");
const { saveSettingsAction } = await import("./actions");

beforeEach(() => {
  settings.saveSettings.mockReset();
  requireSession.mockResolvedValue(TEST_SESSION);
});

describe("天氣設定", () => {
  it("沒登入時往外丟出導向登入頁：不存設定，快取不失效", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(saveSettingsAction({}, form({ county: "高雄市", rainAlert: "true" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(settings.saveSettings).not.toHaveBeenCalled();
    expect(updated()).toEqual([]);
  });

  it("寫的是登入者自己的那一列：表單夾帶別人的 id 也不理", async () => {
    settings.saveSettings.mockResolvedValue("高雄市");
    requireSession.mockResolvedValue(OTHER_SESSION);

    expect((await saveSettingsAction({}, form({ county: "高雄市", rainAlert: "true", userId: TEST_SESSION.id }))).error).toBeUndefined();
    expect(settings.saveSettings).toHaveBeenCalledWith(OTHER_SESSION.id, { county: "高雄市", rainAlert: true });
  });

  it("沒勾「早上會下雨時通知我」時存成關：沒勾的 checkbox 不會送出", async () => {
    settings.saveSettings.mockResolvedValue("臺北市");

    await saveSettingsAction({}, form({ county: "臺北市" }));
    expect(settings.saveSettings).toHaveBeenCalledWith(TEST_SESSION.id, { county: "臺北市", rainAlert: false });
  });

  it("不在清單的縣市：顯示原因，快取不失效", async () => {
    settings.saveSettings.mockRejectedValue(new WeatherUserError("請從清單選一個縣市"));

    expect(await saveSettingsAction({}, form({ county: "台灣", rainAlert: "true" }))).toEqual({ error: "請從清單選一個縣市" });
    expect(updated()).toEqual([]);
  });
});
