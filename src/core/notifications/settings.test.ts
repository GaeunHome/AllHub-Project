import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// 提醒開關存在瀏覽器 要指定開關狀態的測試換掉 useAnyAlertPref
// 其他照原本的實作 伺服器算繪時是預設的全開
vi.mock("./prefs", { spy: true });

const { AlertSwitchTable, NotificationSettings } = await import("./settings");
const { useAnyAlertPref } = await import("./prefs");

afterEach(() => {
  vi.mocked(useAnyAlertPref).mockReset();
});

describe("提醒方式的模組開關", () => {
  it("模組清單由呼叫端傳入_每個模組一列，各有提示音與瀏覽器通知兩個開關（新增模組會自動出現）", () => {
    const modules = [
      { id: "twitch", name: "Twitch" },
      { id: "garden", name: "花園" },
    ];

    const markup = renderToStaticMarkup(createElement(AlertSwitchTable, { modules }));

    expect(markup.match(/role="switch"/g)).toHaveLength(4);
    for (const label of ["Twitch：提示音", "Twitch：瀏覽器通知", "花園：提示音", "花園：瀏覽器通知"]) expect(markup).toContain(`aria-label="${label}"`);
  });

  it("notifies 是 false 的模組不會發通知_不出現在提醒方式（例如理財）", () => {
    const modules = [
      { id: "twitch", name: "Twitch" },
      { id: "savings", name: "理財", notifies: false },
    ];

    const markup = renderToStaticMarkup(createElement(AlertSwitchTable, { modules }));

    expect(markup.match(/role="switch"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Twitch：提示音"');
    expect(markup).not.toContain("理財");
  });

  it("伺服器算繪時讀不到瀏覽器的設定_先顯示預設的全開", () => {
    const markup = renderToStaticMarkup(createElement(AlertSwitchTable, { modules: [{ id: "twitch", name: "Twitch" }] }));

    expect(markup.match(/checked=""/g)).toHaveLength(2);
  });
});

describe("通知頁的「提醒方式」", () => {
  const MODULES = [
    { id: "twitch", name: "Twitch" },
    { id: "savings", name: "理財", notifies: false },
  ];
  /** 只有這些模組開著提示音時 提示音那一區的圖示名稱 */
  const soundIconWith = (enabled: string[]) => {
    vi.mocked(useAnyAlertPref).mockImplementation((ids, kind) => kind === "sound" && ids.some((id) => enabled.includes(id)));
    const markup = renderToStaticMarkup(createElement(NotificationSettings, { modules: MODULES }));
    return markup.match(/\/icons\/ui\/(volume-[\w-]+)\.svg/)?.[1];
  };

  it("有模組開著提示音_「提示音」旁是喇叭的圖示", () => {
    expect(soundIconWith(["twitch"])).toBe("volume-2");
  });

  it("看得到的提示音開關全關了_改成靜音的圖示；不發通知的模組（理財，沒有開關、沿用舊的全域值）開著也不算", () => {
    expect(soundIconWith(["savings"])).toBe("volume-x");
  });
});
