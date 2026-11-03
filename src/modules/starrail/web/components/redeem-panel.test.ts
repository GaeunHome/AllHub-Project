import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createToastApi, type ToastContent } from "@/core/ui/toast-queue";
import { form, markup as render, textOf } from "@/dev/test-helpers";

vi.mock("../actions", () => ({ redeemCodeAction: vi.fn() }));

const { RedeemPanel, redeemFormAction } = await import("./redeem-panel");

const panel = () => createElement(RedeemPanel, { accountId: 7, label: "台港澳服 · 開拓者（UID 900123456）" });

/** 跳出的提示照順序記下來 */
function recorder() {
  const shown: ToastContent[] = [];
  return { shown, toast: createToastApi((content) => void shown.push(content)) };
}

describe("兌換碼", () => {
  it("兌換到哪個帳號、輸入框與兌換鈕；卡片上沒有結果框", () => {
    const markup = render(panel());

    expect(markup).toMatch(/<input type="hidden" name="accountId" value="7"/);
    expect(markup).toContain('name="code"');
    expect(textOf(markup)).toContain("台港澳服 · 開拓者（UID 900123456）");
    expect(markup).not.toMatch(/role="(?:status|alert)"/);
  });

  it("不再替結果框留高度：拿掉超寬螢幕的三列格線與結果框的最小高度", () => {
    const markup = render(panel());

    const formClasses = /<form[^>]*class="([^"]*)"/.exec(markup)![1].split(" ");
    expect(formClasses.filter((c) => /grid-rows|^2xl:grid$/.test(c))).toEqual([]);
    expect(markup).not.toMatch(/min-h-\[/);
  });
});

describe("送出兌換碼（redeemFormAction）", () => {
  it("成功：提示視窗的標題寫結果與剛才兌換的碼（送出後輸入框會清空），內容是 HoYoLAB 的說明", async () => {
    const { shown, toast } = recorder();
    const onSubmitted = vi.fn();

    await redeemFormAction(vi.fn(async () => ({ message: "獎勵會寄到遊戲內信箱" })), toast, onSubmitted)({}, form({ accountId: "7", code: "GIFT2026" }));

    expect(shown).toEqual([{ tone: "success", title: "兌換成功：GIFT2026", body: "獎勵會寄到遊戲內信箱" }]);
    expect(onSubmitted).toHaveBeenCalledOnce();
  });

  it("失敗：錯誤的提示視窗，標題「兌換失敗」與碼，內容寫原因", async () => {
    const { shown, toast } = recorder();

    await redeemFormAction(vi.fn(async () => ({ error: "兌換碼已過期" })), toast, vi.fn())({}, form({ accountId: "7", code: "EXPIRED1" }));

    expect(shown).toEqual([{ tone: "error", title: "兌換失敗：EXPIRED1", body: "兌換碼已過期" }]);
  });

  it("標的碼跟伺服器同一套規則整理過（全形換半形、去掉所有空白、轉大寫）：就是實際送出的碼", async () => {
    const { shown, toast } = recorder();

    await redeemFormAction(vi.fn(async () => ({ message: "獎勵會寄到遊戲內信箱" })), toast, vi.fn())({}, form({ accountId: "7", code: " ｇｉｆｔ 20 26\t" }));

    expect(shown[0].title).toBe("兌換成功：GIFT2026");
  });

  it("碼本身就不合格（伺服器回規則說明）：標題不標碼，只寫結果，內容寫原因", async () => {
    const { shown, toast } = recorder();

    await redeemFormAction(vi.fn(async () => ({ error: "兌換碼是 4–20 個英文字母或數字" })), toast, vi.fn())({}, form({ accountId: "7", code: "ab!" }));

    expect(shown).toEqual([{ tone: "error", title: "兌換失敗", body: "兌換碼是 4–20 個英文字母或數字" }]);
  });

  it("同樣的結果再出現一次也再跳一次：報讀器會再念", async () => {
    const { shown, toast } = recorder();
    const submit = redeemFormAction(vi.fn(async () => ({ error: "兌換碼無效，請確認有沒有打錯" })), toast, vi.fn());

    await submit({}, form({ accountId: "7", code: "WRONG1" }));
    await submit({}, form({ accountId: "7", code: "WRONG1" }));

    expect(shown).toHaveLength(2);
    expect(shown[1]).toEqual(shown[0]);
  });
});
