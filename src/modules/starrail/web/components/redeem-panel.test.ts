import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { form } from "@/dev/test-helpers";

// 結果要送出後才有 所以直接給 useActionState 送出後的狀態看畫面
// 其他照 React 原本的實作
vi.mock("react", { spy: true });
vi.mock("../actions", () => ({ redeemCodeAction: vi.fn() }));

const { RedeemPanel, RedeemResult, redeemFormAction } = await import("./redeem-panel");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const panel = () => createElement(RedeemPanel, { accountId: 7, label: "台港澳服 · 開拓者（UID 900123456）" });
/**
 * 表單最後面放結果框的那一格 取出 class 與裡面的內容
 * form 後面還有 React 補的 script
 */
const resultSlot = (markup: string) => {
  const match = /<div class="([^"]*)">((?:<div role="(?:status|alert)" class="result-banner.*)?)<\/div><\/form>/.exec(markup);
  return match ? { classes: match[1].split(" "), content: match[2] } : null;
};

describe("兌換碼", () => {
  it("還沒兌換：兌換到哪個帳號、輸入框與兌換鈕，沒有結果框", () => {
    const markup = renderToStaticMarkup(panel());

    expect(markup).toMatch(/<input type="hidden" name="accountId" value="7"/);
    expect(markup).toContain('name="code"');
    expect(textOf(markup)).toContain("台港澳服 · 開拓者（UID 900123456）");
    expect(markup).not.toContain("result-banner");
  });

  it("成功：醒目的結果框（status），標題旁標出剛才兌換的碼（送出後輸入框會清空），下面是 HoYoLAB 的說明", () => {
    const markup = renderToStaticMarkup(createElement(RedeemResult, { state: { message: "獎勵會寄到遊戲內信箱", code: "GIFT2026" } }));

    expect(markup).toMatch(/^<div role="status" class="result-banner result-banner-success"/);
    expect(textOf(markup)).toBe("兌換成功GIFT2026獎勵會寄到遊戲內信箱");
  });

  it("失敗：alert 結果框，標題「兌換失敗」與原因", () => {
    const markup = renderToStaticMarkup(createElement(RedeemResult, { state: { error: "兌換碼已過期", code: "EXPIRED1" } }));

    expect(markup).toMatch(/^<div role="alert" class="result-banner result-banner-error"/);
    expect(textOf(markup)).toBe("兌換失敗EXPIRED1兌換碼已過期");
  });

  it("沒有結果時不畫；不知道是哪一組碼時只寫結果", () => {
    expect(renderToStaticMarkup(createElement(RedeemResult, { state: { code: "GIFT2026" } }))).toBe("");
    expect(textOf(renderToStaticMarkup(createElement(RedeemResult, { state: { error: "請輸入兌換碼" } })))).toBe("兌換失敗請輸入兌換碼");
  });

  it("再按一次兌換：送出中先留著上一次的結果，新結果回來才換掉（不會先清空再出現，下面的內容也不會跳一下）", () => {
    vi.mocked(useActionState).mockReturnValueOnce([{ error: "兌換碼已過期", code: "EXPIRED1", seq: 1 }, vi.fn(), true]);

    const markup = renderToStaticMarkup(panel());

    expect(textOf(markup)).toContain("兌換中…");
    expect(markup).toContain("result-banner-error");
    expect(textOf(markup)).toContain("兌換失敗EXPIRED1兌換碼已過期");
  });

  it("超寬螢幕跟簽到紀錄並排、卡片比內容高時：多出來的高度都給第一列（「兌換到」貼在它的底），輸入框與結果框接在下面；結果出現（一行或兩行）只在留好的位置裡長，不會推動輸入框", () => {
    const markup = renderToStaticMarkup(panel());

    const formClasses = /<form[^>]*class="([^"]*)"/.exec(markup)![1].split(" ");
    expect(formClasses).toEqual(expect.arrayContaining(["2xl:grid", "2xl:grid-rows-[1fr_auto_auto]"]));
    // 上下兩列都用 1fr 時 格線照內容算高度會把兩列撐成一樣高
    // 整列卡片平白多出約 46px
    expect(formClasses.filter((c) => /grid-rows-\[[^\]]*1fr[^\]]*1fr/.test(c))).toEqual([]);
    expect(/<p class="([^"]*)">兌換到/.exec(markup)![1].split(" ")).toContain("2xl:self-end");
  });

  it("結果框的位置先留好兩行說明的高度：卡片不夠高時結果框不會向上擠，輸入框不動；窄螢幕結果接在下面，沒有結果時不佔位", () => {
    const before = resultSlot(renderToStaticMarkup(panel()));
    vi.mocked(useActionState).mockReturnValueOnce([{ message: "獎勵會寄到遊戲內信箱", code: "GIFT2026", seq: 1 }, vi.fn(), false]);
    const after = resultSlot(renderToStaticMarkup(panel()));

    // 結果框高 內距 16×2 + 邊框 2 + 標題 24 + 間距 4 + 說明兩行 40 = 102px
    // 最長的說明是 cookie 少了兌換要用的欄位 在超寬螢幕是兩行
    expect(before).toEqual({ classes: expect.arrayContaining(["2xl:min-h-[6.375rem]", "max-2xl:empty:hidden"]), content: "" });
    expect(before?.classes).not.toContain("2xl:min-h-[5.125rem]");
    expect(after?.classes).toEqual(before?.classes);
    expect(after?.content).toMatch(/^<div role="status" class="result-banner result-banner-success"/);
  });
});

describe("送出兌換碼（redeemFormAction）", () => {
  it("結果帶著跟伺服器同一套規則整理過的碼（全形換半形、去掉所有空白、轉大寫）：畫面標的就是實際送出的碼", async () => {
    const action = vi.fn(async () => ({ message: "獎勵會寄到遊戲內信箱" }));
    const onSubmitted = vi.fn();

    const result = await redeemFormAction(action, onSubmitted)({}, form({ accountId: "7", code: " ｇｉｆｔ 20 26\t" }));

    expect(result).toEqual({ message: "獎勵會寄到遊戲內信箱", code: "GIFT2026", seq: 1 });
    expect(action).toHaveBeenCalledOnce();
    expect(onSubmitted).toHaveBeenCalledOnce();
  });

  it("碼本身就不合格（伺服器回規則說明）：不標碼，只顯示原因", async () => {
    const action = vi.fn(async () => ({ error: "兌換碼是 4–20 個英文字母或數字" }));

    expect(await redeemFormAction(action, vi.fn())({}, form({ accountId: "7", code: "ab!" }))).toEqual({ error: "兌換碼是 4–20 個英文字母或數字", seq: 1 });
  });

  it("每次的結果都編上新的序號：同樣的結果再出現一次，畫面換上新的結果框，報讀器也會再念一次", async () => {
    const action = vi.fn(async () => ({ error: "兌換碼無效，請確認有沒有打錯" }));
    const submit = redeemFormAction(action, vi.fn());

    const first = await submit({}, form({ accountId: "7", code: "WRONG1" }));
    const second = await submit(first, form({ accountId: "7", code: "WRONG1" }));

    expect(first).toMatchObject({ error: "兌換碼無效，請確認有沒有打錯", code: "WRONG1", seq: 1 });
    expect(second).toMatchObject({ error: "兌換碼無效，請確認有沒有打錯", code: "WRONG1", seq: 2 });
  });
});
