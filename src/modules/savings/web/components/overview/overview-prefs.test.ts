import { describe, expect, it } from "vitest";
import type { SetupStep } from "../../../lib/setup";
import { applyOverviewPrefs, overviewPrefsScript, type OverviewPrefs } from "./overview-prefs";

/** 只記下 html 上的屬性 */
const fakeRoot = () => {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  };
};

/** 整頁載入時的腳本 在假的 document 與 localStorage 上跑一次 */
function runScript(pending: SetupStep[], stored: Record<string, string>) {
  const root = fakeRoot();
  const localStorage = { getItem: (key: string) => stored[key] ?? null };
  new Function("document", "localStorage", overviewPrefsScript(pending))({ documentElement: root }, localStorage);
  return Object.fromEntries(root.attributes);
}

const applied = (prefs: OverviewPrefs, hidden: boolean) => {
  const root = fakeRoot();
  applyOverviewPrefs(root, prefs, hidden);
  return Object.fromEntries(root.attributes);
};

describe("開始設定與怎麼用的收起和略過（存在瀏覽器）", () => {
  it("還沒做的步驟都略過了：整張開始設定不出現", () => {
    expect(runScript(["credit", "investment"], { "allhub:savings:setup-skipped": "investment,credit" })).toEqual({ "data-fin-setup": "hidden", "data-fin-skip": "credit investment" });
  });

  it("還有沒略過的步驟：照收起的偏好，略過的那幾步各自換成已略過", () => {
    const stored = { "allhub:savings:setup-skipped": "credit", "allhub:savings:setup-collapsed": "on", "allhub:savings:how-to-collapsed": "on" };

    expect(runScript(["credit", "salary"], stored)).toEqual({ "data-fin-setup": "collapsed", "data-fin-skip": "credit", "data-fin-how-to": "collapsed" });
  });

  it("第一次繪製的樣子跟頁面接手後一樣（腳本與 applyOverviewPrefs 的結果相同）", () => {
    const cases: { pending: SetupStep[]; stored: Record<string, string>; prefs: OverviewPrefs; hidden: boolean }[] = [
      { pending: ["salary"], stored: {}, prefs: { setupCollapsed: false, skipped: [], howToCollapsed: false }, hidden: false },
      { pending: ["salary"], stored: { "allhub:savings:setup-skipped": "salary" }, prefs: { setupCollapsed: false, skipped: ["salary"], howToCollapsed: false }, hidden: true },
      {
        pending: ["deposit", "recurring"],
        stored: { "allhub:savings:setup-collapsed": "on", "allhub:savings:setup-skipped": "recurring" },
        prefs: { setupCollapsed: true, skipped: ["recurring"], howToCollapsed: false },
        hidden: false,
      },
    ];

    for (const { pending, stored, prefs, hidden } of cases) expect(runScript(pending, stored)).toEqual(applied(prefs, hidden));
  });

  it("讀不到 localStorage（隱私模式）時照預設：不收起也不略過", () => {
    const root = fakeRoot();
    const localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };

    expect(() => new Function("document", "localStorage", overviewPrefsScript(["credit"]))({ documentElement: root }, localStorage)).not.toThrow();
    expect(root.attributes.size).toBe(0);
  });
});
