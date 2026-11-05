import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { FormFeedback, FormMessage } from "../form-message";

// lint 規定 children 用第三個參數傳
// 型別上 children 卻是必填 所以 props 斷言成完整的型別
type FormMessageProps = Parameters<typeof FormMessage>[0];
const message = (props: Omit<FormMessageProps, "children">, text: string) => markup(createElement(FormMessage, props as FormMessageProps, text));

describe("表單訊息（FormMessage）", () => {
  it("預設是 live region：錯誤用 alert、成功用 status", () => {
    expect(message({ tone: "error" }, "金額要是整數")).toMatch(/^<p role="alert"/);
    expect(message({ tone: "success" }, "已記錄")).toMatch(/^<p role="status"/);
    expect(textOf(message({ tone: "success" }, "已記錄"))).toBe("已記錄");
  });

  it("live=false：跟彈出視窗一起出現的說明不當 live region（由視窗的 aria-describedby 念，才不會念兩次），給 id 讓視窗指向", () => {
    const html = message({ tone: "success", id: "invite-summary", live: false }, "已建立邀請連結");

    expect(html).toMatch(/^<p id="invite-summary"/);
    expect(html).not.toMatch(/role=|aria-live/);
    expect(textOf(html)).toBe("已建立邀請連結");
  });
});

describe("表單下方的回饋（FormFeedback）", () => {
  it("只放錯誤（使用者要對著欄位修改）；成功的訊息用提示視窗，不留在表單下方", () => {
    expect(markup(createElement(FormFeedback, { state: { error: "金額要是整數" } }))).toMatch(/^<p role="alert"/);
    expect(markup(createElement(FormFeedback, { state: { message: "已儲存" } }))).toBe("");
  });
});
