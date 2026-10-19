import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { textOf } from "@/dev/test-helpers";

// 複製的結果要按下去才有 直接給 useState 一個複製後的狀態
// 其他照 React 原本的實作
vi.mock("react", { spy: true });

const { CopyButton } = await import("./copy-button");

const render = (state?: "copied" | "failed") => {
  if (state) vi.mocked(useState).mockReturnValueOnce([state, vi.fn()]);
  return renderToStaticMarkup(createElement(CopyButton, { text: "https://hub.example.com/register?code=abc", label: "複製連結", className: "btn-primary" }));
};
const buttonOf = (markup: string) => markup.match(/<button([^>]*)>(.*?)<\/button>/)!;

describe("複製按鈕（CopyButton）", () => {
  it("按鈕的名稱一直是 label、裡面沒有 live region：複製後名稱不變，報讀器不會因為焦點上的按鈕改名再念一次", () => {
    for (const state of [undefined, "copied", "failed"] as const) {
      const [, attributes, content] = buttonOf(render(state));

      expect(textOf(content)).toBe("複製連結");
      expect(attributes).toContain('type="button"');
      expect(attributes).toContain('class="btn-primary"');
      expect(`${attributes}${content}`).not.toMatch(/role=|aria-live/);
    }
  });

  it("結果念在按鈕旁邊、一開始就在文件裡的 status（之後才放進去的 live region 不會被念出來）：還沒複製時是空的", () => {
    const markup = render();

    expect(markup).toMatch(/<\/button><span role="status"[^>]*><\/span>$/);
  });

  it("複製成功：圖示換成打勾，旁邊的 status 寫「已複製」", () => {
    const markup = render("copied");

    expect(buttonOf(markup)[2]).toContain("/icons/ui/check.svg");
    expect(markup).toMatch(/<span role="status"[^>]*>已複製<\/span>$/);
  });

  it("剪貼簿被瀏覽器拒絕：旁邊的 status 請使用者自己選取複製", () => {
    const markup = render("failed");

    expect(buttonOf(markup)[2]).toContain("/icons/ui/copy.svg");
    expect(markup).toMatch(/<span role="status"[^>]*>請手動選取複製<\/span>$/);
  });
});
