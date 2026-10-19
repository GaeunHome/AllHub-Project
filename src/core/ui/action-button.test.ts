import { createElement, useActionState } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import type { FormState } from "./form-message";

// 結果要送出之後才有 直接給 useActionState 一個結果 其他照 React 原本的實作
vi.mock("react", { spy: true });

const { ActionButton } = await import("./action-button");

type ButtonProps = Parameters<typeof ActionButton>[0];
const props: Omit<ButtonProps, "children"> = { action: vi.fn(), fields: { videoId: "dQw4w9WgXcQ" } };

/** 上一次送出的結果與是不是正在送出 React 為了 JavaScript 載入前的送出加的 script 不算畫面 */
function render(state: FormState, pending: boolean, extra: Partial<ButtonProps> = {}) {
  vi.mocked(useActionState).mockReturnValue([state, vi.fn(), pending]);
  // lint 規定 children 用第三個參數傳 型別上 children 卻是必填 所以 props 斷言成完整的型別
  return markup(createElement(ActionButton, { ...props, ...extra } as ButtonProps, "重新檢查中文字幕")).replace(/<script[\s\S]*?<\/script>/g, "");
}

describe("只有一個按鈕的表單（ActionButton）", () => {
  it("預設只顯示錯誤：成功時畫面多半會整個刷新，訊息不留在列上", () => {
    expect(textOf(render({ message: "已重新檢查" }, false))).toBe("重新檢查中文字幕");
    expect(render({ error: "找不到這支影片" }, false)).toMatch(/role="alert"[^>]*>找不到這支影片</);
  });

  it("showMessage inline：成功的訊息也顯示在按鈕旁（status）；送出中先收起上一次的結果", () => {
    expect(render({ message: "已有中文字幕" }, false, { showMessage: "inline" })).toMatch(/role="status"[^>]*>已有中文字幕</);
    expect(render({ error: "找不到這支影片" }, false, { showMessage: "inline" })).toMatch(/role="alert"[^>]*>找不到這支影片</);
    expect(textOf(render({ message: "已有中文字幕" }, true, { showMessage: "inline", pendingLabel: "檢查中…" }))).toBe("檢查中…");
  });

  it("showMessage block：結果用按鈕下方有圖示的訊息（FormFeedback）；送出中一樣先收起", () => {
    const html = render({ message: "已續訂 3 個頻道" }, false, { showMessage: "block" });

    expect(html).toMatch(/<p role="status"[^>]*>/);
    expect(textOf(html)).toContain("已續訂 3 個頻道");
    expect(textOf(render({ message: "已續訂 3 個頻道" }, true, { showMessage: "block" }))).not.toContain("已續訂");
  });
});
