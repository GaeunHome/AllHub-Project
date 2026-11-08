import { describe, expect, it } from "vitest";
import { TICKER_HIDDEN_ATTRIBUTE, TICKER_KEY, isTickerDismissed, tickerItems, tickerScript } from "../ticker";

const row = (values: Record<string, unknown>) => ({ id: 1, kind: "general" as const, title: "公告", body: "", startsAt: null, endsAt: null, pinned: false, createdAt: new Date("2026-11-01T00:00:00Z"), updatedAt: new Date("2026-11-01T00:00:00Z"), ...values });
const now = new Date("2026-11-10T00:00:00Z");

describe("跑馬燈的內容", () => {
  it("停止服務排最前面 一般公告要置頂才放", () => {
    const items = tickerItems(
      [
        row({ id: 1, kind: "maintenance", title: "交通資料調整", startsAt: new Date("2026-11-09T23:00:00Z") }),
        row({ id: 2, title: "新功能上線" }),
        row({ id: 3, title: "三鶯線上線", pinned: true }),
        row({ id: 4, kind: "outage", title: "資料庫升級", startsAt: new Date("2026-11-11T05:00:00Z"), endsAt: new Date("2026-11-11T07:00:00Z") }),
      ],
      now,
    );

    expect(items.map((item) => item.title)).toEqual(["資料庫升級", "交通資料調整", "三鶯線上線"]);
    expect(items[0]).toMatchObject({ kind: "outage", when: "11/11 13:00–15:00" });
  });

  it("站長改過的公告是新的一則 關掉後會再出現", () => {
    const before = tickerItems([row({ pinned: true })], now)[0].key;
    const after = tickerItems([row({ pinned: true, updatedAt: new Date("2026-11-02T00:00:00Z") })], now)[0].key;

    expect(after).not.toBe(before);
  });
});

describe("關掉跑馬燈（使用者要的：可以關掉 有新的或改過的公告才再出現）", () => {
  it("關掉時的每一則都還在 就不出現；多了一則就出現", () => {
    expect(isTickerDismissed("1:100,2:200", ["1:100", "2:200"])).toBe(true);
    expect(isTickerDismissed("1:100,2:200", ["2:200"])).toBe(true);
    expect(isTickerDismissed("1:100", ["1:100", "3:300"])).toBe(false);
    expect(isTickerDismissed(null, ["1:100"])).toBe(false);
  });

  it("整頁載入時第一次繪製前就藏好 腳本跟畫面用同一個判斷", () => {
    const run = (stored: string | null, keys: string[]) => {
      const attributes = new Set<string>();
      const fakeWindow = {
        localStorage: { getItem: (key: string) => (key === TICKER_KEY ? stored : null) },
        document: { documentElement: { setAttribute: (name: string) => void attributes.add(name) } },
      };
      new Function("localStorage", "document", tickerScript(keys))(fakeWindow.localStorage, fakeWindow.document);
      return attributes.has(TICKER_HIDDEN_ATTRIBUTE);
    };

    for (const [stored, keys] of [["1:100,2:200", ["1:100", "2:200"]], ["1:100", ["1:100", "3:300"]], [null, ["1:100"]], ["", ["1:100"]]] as const) expect(run(stored, [...keys])).toBe(isTickerDismissed(stored, keys));
  });
});
