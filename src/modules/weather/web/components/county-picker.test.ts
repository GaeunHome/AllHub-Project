import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireSession } from "@/dev/session-stub";
import { markup as render, mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/settings", { spy: true });

const settings = mocksOf(await import("../../service/settings"), "saveSettings");
const { saveSettingsAction } = await import("../actions");
const { SettingsForm } = await import("./county-picker");

/** 照瀏覽器送出表單的規則 有勾的 checkbox 才送 沒寫 value 時送 on 下拉選單送選中的那一個 */
function submitted(markup: string): FormData {
  const data = new FormData();
  for (const [, attrs] of markup.matchAll(/<input ([^>]*?)\/?>/g)) {
    const name = attrs.match(/name="([^"]*)"/)?.[1];
    if (!name || (attrs.includes('type="checkbox"') && !attrs.includes('checked=""'))) continue;
    data.append(name, attrs.match(/value="([^"]*)"/)?.[1] ?? "on");
  }
  for (const [, name, options] of markup.matchAll(/<select[^>]*name="([^"]*)"[^>]*>(.*?)<\/select>/g)) {
    data.append(name, options.match(/<option value="([^"]*)" selected="">/)?.[1] ?? "");
  }
  return data;
}

const submit = async (current: Parameters<typeof SettingsForm>[0]["settings"]) => {
  await saveSettingsAction({}, submitted(render(createElement(SettingsForm, { settings: current, onDone: vi.fn(), onCancel: vi.fn() }))));
  return settings.saveSettings.mock.calls[0]?.[1];
};

beforeEach(() => {
  settings.saveSettings.mockReset();
  settings.saveSettings.mockResolvedValue("臺北市");
  requireSession.mockResolvedValue(TEST_SESSION);
});

describe("天氣設定視窗", () => {
  it("第一次設定時早上的下雨通知預設勾選，不動直接儲存就是開", async () => {
    expect(await submit(null)).toMatchObject({ rainAlert: true });
  });

  it("打開時是存好的縣市與開關：關掉過的人直接儲存還是關", async () => {
    expect(await submit({ county: "高雄市", rainAlert: false })).toEqual({ county: "高雄市", rainAlert: false });
    settings.saveSettings.mockClear();
    expect(await submit({ county: "花蓮縣", rainAlert: true })).toEqual({ county: "花蓮縣", rainAlert: true });
  });
});
