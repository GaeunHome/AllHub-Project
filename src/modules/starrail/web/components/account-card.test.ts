import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup as render } from "@/dev/test-helpers";
import { accountView } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const { AutoRedeemSetting, GameRemindersSetting } = await import("./account-card");

const account = (autoRedeem: boolean, canAutoRedeem: boolean, gameReminders = true) => accountView({ autoRedeem, canAutoRedeem, gameReminders });
const toggle = (autoRedeem: boolean, canAutoRedeem: boolean) => {
  const markup = render(createElement(AutoRedeemSetting, { account: account(autoRedeem, canAutoRedeem) }));
  return /<button[^>]*role="switch"[^>]*>/.exec(markup)?.[0] ?? "";
};

describe("帳號設定的「自動兌換新的兌換碼」開關", () => {
  it("是一個開關，送出的是相反的狀態（開著時按下去是關掉）", () => {
    const markup = render(createElement(AutoRedeemSetting, { account: account(true, true) }));

    expect(toggle(true, true)).toContain('aria-checked="true"');
    expect(markup).toMatch(/name="enabled" value="false"/);
    expect(markup).toContain("自動兌換新的兌換碼");
  });

  it("cookie 有兌換要用的鍵才能打開；沒有的話開關停用，說明要補 cookie_token_v2", () => {
    expect(toggle(false, true)).not.toContain("disabled");
    expect(toggle(false, false)).toContain("disabled");
    expect(render(createElement(AutoRedeemSetting, { account: account(false, false) }))).toContain("cookie_token_v2");
  });

  it("已經打開、後來換了少欄位的 cookie_還是可以關掉", () => {
    expect(toggle(true, false)).not.toContain("disabled");
  });
});

describe("帳號設定的「每日、每週與終局提醒」開關（站長的決定）", () => {
  const markup = (gameReminders: boolean) => render(createElement(GameRemindersSetting, { account: account(false, true, gameReminders) }));

  it("是一個開關，送出的是相反的狀態：開著時按下去是關掉，關著時按下去是打開", () => {
    expect(markup(true)).toMatch(/<button[^>]*role="switch"[^>]*aria-checked="true"/);
    expect(markup(true)).toMatch(/name="enabled" value="false"/);
    expect(markup(false)).toMatch(/<button[^>]*role="switch"[^>]*aria-checked="false"/);
    expect(markup(false)).toMatch(/name="enabled" value="true"/);
    expect(markup(true)).toContain("每日、每週與終局提醒");
  });
});
