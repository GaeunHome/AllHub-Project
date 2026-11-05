import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { UserAvatar } from "../user-avatar";

const render = (avatar?: string | null) => markup(createElement(UserAvatar, { username: "alice", name: "小明", size: "md", avatar }));

describe("站內帳號的頭像", () => {
  it("選了範例頭像就畫那張圖", () => {
    expect(render("cat")).toContain('src="/images/avatars/cat.webp"');
  });

  it("沒選時是名字的第一個字", () => {
    expect(textOf(render(null))).toBe("小");
    expect(render(null)).not.toContain("<img");
  });

  it("資料庫裡的值認不得（圖被移除了）_退回文字頭像，不會是破圖", () => {
    expect(textOf(render("removed-one"))).toBe("小");
    expect(render("removed-one")).not.toContain("<img");
  });
});
