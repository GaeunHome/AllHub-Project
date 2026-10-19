import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { FormMessage, ResultBanner } from "./form-message";

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

describe("醒目的結果（ResultBanner）", () => {
  it("成功：status、標題與說明", () => {
    const html = markup(createElement(ResultBanner, { tone: "success", title: "兌換成功" }, "獎勵會寄到遊戲內信箱"));

    expect(html).toMatch(/^<div role="status"/);
    expect(textOf(html)).toBe("兌換成功獎勵會寄到遊戲內信箱");
  });

  it("失敗：alert 立刻念出來", () => {
    const html = markup(createElement(ResultBanner, { tone: "error", title: "兌換失敗" }, "兌換碼已過期"));

    expect(html).toMatch(/^<div role="alert"/);
    expect(textOf(html)).toBe("兌換失敗兌換碼已過期");
  });

  it("提醒：成功了但有要注意的地方，用 status 不打斷（例如連結成功了但 cookie 少了 ltmid_v2）", () => {
    const html = markup(createElement(ResultBanner, { tone: "warning", title: "建議一併貼上 ltmid_v2，否則即時便箋可能失敗" }));

    expect(html).toMatch(/^<div role="status"/);
    expect(textOf(html)).toBe("建議一併貼上 ltmid_v2，否則即時便箋可能失敗");
  });
});
