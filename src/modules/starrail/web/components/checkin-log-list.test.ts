import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { CheckinLogList } from "./checkin-log-list";

/** 跟資料庫讀出來的一樣新的在前 累計天數等於 id 看得出每一列是哪一筆 */
const logs = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const id = count - index;
    return { log: { id, result: "success", message: "簽到成功", totalSignDay: id, createdAt: new Date(Date.UTC(2026, 8, id, 16, 10)) } };
  });
const render = (count: number) => markup(createElement(CheckinLogList, { logs: logs(count) }));
const rowCount = (markup: string) => markup.match(/<li[\s>]/g)?.length ?? 0;
/** 切成 details 前面直接列出的部分與 details 本身 */
const parts = (markup: string) => {
  const at = markup.indexOf("<details");
  return at < 0 ? { shown: markup, folded: "" } : { shown: markup.slice(0, at), folded: markup.slice(at) };
};

describe("簽到紀錄：最近 5 筆直接列出，更早的收起來", () => {
  it("超過 5 筆_最新的 5 筆直接列出，其餘收在預設關著的 details 裡", () => {
    const { shown, folded } = parts(render(17));

    expect(rowCount(shown)).toBe(5);
    expect(rowCount(folded)).toBe(12);
    expect(/<details[^>]*>/.exec(folded)?.[0]).not.toMatch(/\sopen[\s=>]/);
    for (const day of [17, 16, 15, 14, 13]) expect(textOf(shown)).toContain(`累計 ${day} 天`);
    for (const day of [12, 1]) expect(textOf(folded)).toContain(`累計 ${day} 天`);
    expect(textOf(folded)).not.toContain("累計 13 天");
  });

  it("summary 寫出收起來的筆數", () => {
    const summary = (markup: string) => textOf(/<summary[^>]*>(.*?)<\/summary>/.exec(markup)?.[1] ?? "");

    expect(summary(render(17))).toBe("顯示更早的紀錄（12 筆）");
    expect(summary(render(6))).toBe("顯示更早的紀錄（1 筆）");
  });

  it("5 筆以內_全部直接列出，沒有 details", () => {
    for (const count of [5, 1]) {
      const markup = render(count);

      expect(markup).not.toContain("<details");
      expect(rowCount(markup)).toBe(count);
    }
  });
});
