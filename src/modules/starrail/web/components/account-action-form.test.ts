import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 結果要送出後才有 所以直接給 useActionState 送出後的狀態看畫面
// 其他照 React 原本的實作
vi.mock("react", { spy: true });

const { AccountActionForm, numberedAction } = await import("./account-action-form");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const props = { action: vi.fn(), accountId: 7, label: "立即簽到", pendingLabel: "簽到中…", icon: "calendar-check" as const };
const render = (state: object, pending = false) => {
  vi.mocked(useActionState).mockReturnValue([state, vi.fn(), pending]);
  return renderToStaticMarkup(createElement(AccountActionForm, props));
};

describe("帳號卡片上的小表單（立即簽到、設定門檻）", () => {
  it("成功的結果用醒目的結果橫幅（跟兌換碼一樣），報讀器等手上的內容念完再念", () => {
    const markup = render({ message: "簽到成功，已累計 5 天" });

    expect(markup).toMatch(/<div role="status" class="result-banner result-banner-success">/);
    expect(markup).toContain("/icons/ui/circle-check.svg");
    expect(textOf(markup)).toContain("簽到成功，已累計 5 天");
  });

  it("失敗用 alert 立刻念出來：標題說哪個動作失敗，下面是原因", () => {
    const markup = render({ error: "HoYoLAB cookie 已失效" });

    expect(markup).toMatch(/<div role="alert" class="result-banner result-banner-error">/);
    expect(textOf(markup)).toContain("立即簽到失敗HoYoLAB cookie 已失效");
  });

  it("結果自己佔一整列、排在最後：按鈕留在原本的位置，橫幅不會被擠成一小欄", () => {
    const markup = render({ message: "簽到成功" });

    expect(markup).toMatch(/^<form class="contents"[ >]/);
    const wrapper = markup.match(/<div class="([^"]*)"><div role="status" class="result-banner/)![1].split(" ");
    expect(wrapper).toEqual(expect.arrayContaining(["basis-full", "order-last"]));
  });

  it("處理中：按鈕寫「簽到中…」，上一次的結果先留著，新結果回來才換掉（跟兌換碼一樣，下面的內容不會先往上跳再掉回來）", () => {
    const markup = render({ message: "今天已經簽到過了", seq: 1 }, true);

    expect(markup).toContain("簽到中…");
    expect(markup).toMatch(/<div role="status" class="result-banner result-banner-success">/);
    expect(textOf(markup)).toContain("今天已經簽到過了");
  });

  it("還沒送出：沒有結果橫幅", () => {
    expect(render({})).not.toContain("result-banner");
  });
});

describe("送出（numberedAction）", () => {
  it("每次的結果都編上新的序號：同樣的結果再出現一次，畫面換上新的結果框，報讀器也會再念一次", async () => {
    const action = vi.fn(async () => ({ message: "今天已經簽到過了" }));
    const submit = numberedAction(action);
    const formData = new FormData();

    const first = await submit({}, formData);
    const second = await submit(first, formData);

    expect(first).toEqual({ message: "今天已經簽到過了", seq: 1 });
    expect(second).toEqual({ message: "今天已經簽到過了", seq: 2 });
    expect(action).toHaveBeenCalledTimes(2);
    expect(action).toHaveBeenLastCalledWith(first, formData);
  });

  it("失敗的結果也編號", async () => {
    const submit = numberedAction(vi.fn(async () => ({ error: "HoYoLAB cookie 已失效" })));

    expect(await submit({ message: "簽到成功", seq: 4 }, new FormData())).toEqual({ error: "HoYoLAB cookie 已失效", seq: 5 });
  });
});
