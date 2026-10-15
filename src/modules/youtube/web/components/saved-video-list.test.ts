import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedVideoList } from "./saved-video-list";

const items = ["a", "b"].map((id) => ({ id, text: `影片 ${id}`, card: createElement("p", null, `卡片 ${id}`) }));
const markup = renderToStaticMarkup(createElement(SavedVideoList, { items, limit: 15 }));
const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("已保留的影片清單（瀏覽器裡篩選）", () => {
  it("上方有搜尋框與「已保留 N／15」", () => {
    expect(markup).toMatch(/<input[^>]*type="search"/);
    expect(markup).toMatch(/aria-label="搜尋已保留的影片"/);
    expect(text).toContain("已保留 2／15");
  });
});
