import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormMessage, ResultBanner } from "./form-message";

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
// lint 規定 children 用第三個參數傳
// 型別上 children 卻是必填 所以 props 斷言成完整的型別
type FormMessageProps = Parameters<typeof FormMessage>[0];
const message = (props: Omit<FormMessageProps, "children">, text: string) => renderToStaticMarkup(createElement(FormMessage, props as FormMessageProps, text));

describe("表單訊息（FormMessage）", () => {
  it("預設是 live region：錯誤用 alert、成功用 status", () => {
    expect(message({ tone: "error" }, "金額要是整數")).toMatch(/^<p role="alert" class="form-message form-message-error"/);
    expect(message({ tone: "success" }, "已記錄")).toMatch(/^<p role="status" class="form-message form-message-success"/);
  });

  it("live=false：跟彈出視窗一起出現的說明不當 live region（由視窗的 aria-describedby 念，才不會念兩次），給 id 讓視窗指向；樣子不變", () => {
    const markup = message({ tone: "success", id: "invite-summary", live: false }, "已建立邀請連結");

    expect(markup).toMatch(/^<p id="invite-summary" class="form-message form-message-success">/);
    expect(markup).not.toMatch(/role=|aria-live/);
    expect(markup).toContain("/icons/ui/circle-check.svg");
  });
});

describe("醒目的結果（ResultBanner）", () => {
  it("成功：status、打勾圖示、標題與說明", () => {
    const markup = renderToStaticMarkup(createElement(ResultBanner, { tone: "success", title: "兌換成功" }, "獎勵會寄到遊戲內信箱"));

    expect(markup).toMatch(/^<div role="status" class="result-banner result-banner-success"/);
    expect(markup).toContain("/icons/ui/circle-check.svg");
    expect(textOf(markup)).toBe("兌換成功獎勵會寄到遊戲內信箱");
  });

  it("失敗：alert 立刻念出來、警告圖示", () => {
    const markup = renderToStaticMarkup(createElement(ResultBanner, { tone: "error", title: "兌換失敗" }, "兌換碼已過期"));

    expect(markup).toMatch(/^<div role="alert" class="result-banner result-banner-error"/);
    expect(markup).toContain("/icons/ui/circle-alert.svg");
  });

  it("提醒：status、警告色（例如連結成功了但 cookie 少了 ltmid_v2）", () => {
    const markup = renderToStaticMarkup(createElement(ResultBanner, { tone: "warning", title: "建議一併貼上 ltmid_v2，否則即時便箋可能失敗" }));

    expect(markup).toMatch(/^<div role="status" class="result-banner result-banner-warning"/);
    expect(markup).toContain("/icons/ui/circle-alert.svg");
    expect(textOf(markup)).toBe("建議一併貼上 ltmid_v2，否則即時便箋可能失敗");
  });
});
