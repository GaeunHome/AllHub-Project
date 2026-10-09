import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PasswordInput, passwordToggle } from "./password-input";

describe("密碼顯示切換", () => {
  it("隱藏時_輸入框是 password，按鈕寫「顯示密碼」、用 eye 圖示", () => {
    expect(passwordToggle(false)).toEqual({ type: "password", label: "顯示密碼", icon: "eye" });
  });

  it("顯示時_輸入框是 text，按鈕寫「隱藏密碼」、用 eye-off 圖示", () => {
    expect(passwordToggle(true)).toEqual({ type: "text", label: "隱藏密碼", icon: "eye-off" });
  });

  it("預設隱藏_按鈕是 type=button（不會送出表單）並帶 aria-pressed；autocomplete 等屬性照原本傳進來的", () => {
    const markup = renderToStaticMarkup(createElement(PasswordInput, { name: "password", autoComplete: "new-password", required: true }));

    const input = markup.match(/<input[^>]*>/)![0];
    expect(input).toContain('type="password"');
    expect(input).toContain('name="password"');
    expect(input).toMatch(/autocomplete="new-password"/i);
    expect(input).toContain("required");
    const button = markup.match(/<button[^>]*>/)![0];
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-label="顯示密碼"');
    expect(button).toContain('aria-pressed="false"');
    expect(markup).toContain("/icons/ui/eye.svg");
  });
});
