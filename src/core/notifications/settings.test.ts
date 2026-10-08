import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AlertSwitchTable } from "./settings";

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

  it("notifies 是 false 的模組不會發通知_不出現在提醒方式（例如存錢記帳）", () => {
    const modules = [
      { id: "twitch", name: "Twitch" },
      { id: "savings", name: "存錢記帳", notifies: false },
    ];

    const markup = renderToStaticMarkup(createElement(AlertSwitchTable, { modules }));

    expect(markup.match(/role="switch"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Twitch：提示音"');
    expect(markup).not.toContain("存錢記帳");
  });

  it("伺服器算繪時讀不到瀏覽器的設定_先顯示預設的全開", () => {
    const markup = renderToStaticMarkup(createElement(AlertSwitchTable, { modules: [{ id: "twitch", name: "Twitch" }] }));

    expect(markup.match(/checked=""/g)).toHaveLength(2);
  });
});
