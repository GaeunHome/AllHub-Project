import { createElement, useActionState } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { toasts } from "@/dev/toast-stub";
import type { FormState } from "@/core/ui/form-message";

// 結果要送出後才有 所以直接給 useActionState 送出後的狀態看畫面
// 其他照 React 原本的實作
vi.mock("react", { spy: true });
vi.mock("@/core/ui/toast", () => import("@/dev/toast-stub"));

const { AccountActionForm } = await import("../account-action-form");

type Submit = (previous: FormState, formData: FormData) => Promise<FormState>;
const props = (action: Submit = vi.fn()) => ({ action, accountId: 7, label: "立即簽到", pendingLabel: "簽到中…", icon: "calendar-check" as const });
const render = (pending = false) => {
  vi.mocked(useActionState).mockReturnValueOnce([{}, vi.fn(), pending]);
  return markup(createElement(AccountActionForm, props()));
};
/** 取出交給 useActionState 的 action 送出時跑的就是它 */
function submitOf(action: Submit): Submit {
  let submit: Submit | undefined;
  vi.mocked(useActionState).mockImplementationOnce(((fn: Submit) => {
    submit = fn;
    return [{}, vi.fn(), false];
  }) as never);
  markup(createElement(AccountActionForm, props(action)));
  return submit!;
}

describe("帳號卡片上的小表單（立即簽到、設定門檻）", () => {
  it("成功：結果用提示視窗（跟兌換碼一樣），不留在卡片上", async () => {
    await submitOf(vi.fn(async () => ({ message: "簽到成功，已累計 5 天" })))({}, new FormData());

    expect(toasts).toEqual([{ tone: "success", title: "簽到成功，已累計 5 天" }]);
  });

  it("失敗：提示視窗的標題寫哪個動作失敗，內容寫原因", async () => {
    await submitOf(vi.fn(async () => ({ error: "HoYoLAB cookie 已失效" })))({}, new FormData());

    expect(toasts).toEqual([{ tone: "error", title: "立即簽到失敗", body: "HoYoLAB cookie 已失效" }]);
  });

  it("送出時帶著帳號 id，按鈕排進外層那一列（表單是 contents）；卡片上不再有結果框", () => {
    const html = render();

    expect(html).toMatch(/^<form class="contents"[ >]/);
    expect(html).toMatch(/<input type="hidden" name="accountId" value="7"\/>/);
    expect(html).not.toMatch(/role="(?:status|alert)"/);
  });

  it("處理中：按鈕寫「簽到中…」", () => {
    expect(textOf(render(true))).toContain("簽到中…");
  });
});
