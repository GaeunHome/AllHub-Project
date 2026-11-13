import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "@/dev/navigation-stub";
import { form, markup as render, textOf } from "@/dev/test-helpers";
import { toasts } from "@/dev/toast-stub";

vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
// 視窗關著時內容不算繪 換掉 useDialog 才看得到裡面的表單
// 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/toast", () => import("@/dev/toast-stub"));
vi.mock("../../actions", () => ({ linkAccountAction: vi.fn(), loginAccountAction: vi.fn() }));

const dialog = await import("@/core/ui/dialog");
const { linkAccountAction, loginAccountAction } = await import("../../actions");
const { LinkAccountFields, LinkAccountForm } = await import("../link-account-form");
const { CookieLinkForm, RoleChooser } = await import("../cookie-link-form");
const { LoginLinkForm } = await import("../login-link-form");

// 使用者選的 登入用彈出視窗 樣子是星穹列車的乘車證 貼 cookie 放在下方的小連結
describe("連結 HoYoLAB 帳號：彈出視窗", () => {
  it("還沒有帳號_頁面上是一張大卡片與「連結帳號」按鈕，登入的表單在彈出視窗裡、點了才出現", () => {
    const markup = render(createElement(LinkAccountForm, { variant: "hero" }));

    expect(markup).toContain("連結 HoYoLAB 帳號");
    expect(markup).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*連結帳號/);
    expect(markup).toMatch(/<dialog[^>]*class="[^"]*sr-dialog/);
    expect(markup).not.toContain('name="account"');
  });

  it("已經有帳號_「新增帳號或更新 cookie」按鈕打開同一個視窗，點了才出現", () => {
    const markup = render(createElement(LinkAccountForm, { variant: "button" }));

    expect(markup).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*新增帳號或更新 cookie/);
    expect(markup).toMatch(/<dialog[^>]*class="[^"]*sr-dialog/);
    // 星空由 sr-dialog 自己畫 theme-starrail 只能放 PageTheme 上
    // 掛在視窗上的話換頁時會漏過去
    expect(markup).not.toMatch(/<dialog[^>]*theme-starrail/);
    expect(markup).not.toContain('name="account"');
    expect(markup).not.toContain('name="cookie"');
  });

  // 使用者要的 盡可能保存 cookie 帳號密碼登入才拿得到換新用的 stoken 貼 cookie 留著當備用
  it("視窗裡預設是帳號密碼登入；貼 cookie 改成下方的「登不進去？改用貼上 cookie」，不再是上方的分頁", () => {
    const markup = render(createElement(LinkAccountFields, {}));

    expect(markup).toContain('name="account"');
    expect(markup).toMatch(/<input[^>]*type="password"[^>]*name="password"|<input[^>]*name="password"[^>]*type="password"/);
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*>登不進去？改用貼上 cookie/);
    expect(markup).not.toMatch(/<button[^>]*aria-pressed[^>]*>(?:帳號密碼登入|貼上 cookie)/);
    expect(markup).not.toContain('name="cookie"');
  });

  it("貼上 cookie 的表單照舊：貼 cookie 的欄位", () => {
    expect(render(createElement(CookieLinkForm, { onDone: vi.fn() }))).toContain('name="cookie"');
  });
});

describe("選伺服器的步驟", () => {
  const role = (uid: string, selected: boolean) => ({ uid, server: "台港澳服", nickname: "開拓者", level: 70, selected });

  it("cookie 跟著勾選的 UID 再送一次；第一個角色標了 data-autofocus（換到這一步或出錯時焦點放回這裡）", () => {
    const markup = render(createElement(RoleChooser, { cookie: "ltoken_v2=abc", choices: [role("900000001", true), role("800000002", false)], pending: false, onBack: vi.fn() }));

    expect(markup).toMatch(/<input type="hidden" name="cookie" value="ltoken_v2=abc"/);
    const boxes = markup.match(/<input type="checkbox"[^>]*>/g)!;
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toContain("data-autofocus");
    expect(boxes[1]).not.toContain("data-autofocus");
  });
});

type FormArgs = Parameters<typeof dialog.useDialogForm<import("../../actions").LinkState>>;
const ROLES = [{ uid: "900000001", server: "台港澳服", nickname: "開拓者", level: 70, selected: true }];
const LINKED = { message: "已連結 開拓者（台港澳服，900000001）", warning: "建議一併貼上 ltmid_v2，否則即時便箋可能失敗", accountId: 9 };

describe("連結帳號的表單送出後", () => {
  const done = vi.fn();
  /** 這次算繪交給 useDialogForm 的 Server Action 完成處理與完成了沒的判斷 */
  const formArgs = () => vi.mocked(dialog.useDialogForm).mock.calls.at(-1) as unknown as FormArgs;

  beforeEach(() => {
    done.mockReset();
    router.push.mockReset();
    vi.mocked(dialog.useDialogForm).mockClear();
    // 視窗關著時內容不算繪 換成開著的 才看得到裡面的表單
    vi.mocked(dialog.useDialog).mockImplementation(
      () => ({ open: true, triggerProps: { type: "button" }, dialogProps: { id: "link", open: true, onClose: vi.fn() }, close: vi.fn(), done }) as unknown as ReturnType<typeof dialog.useDialog>,
    );
  });

  it("用 onSubmit 送出、不用 <form action>：React 送完會清空欄位，第二步失敗時勾選的伺服器會變回預設", () => {
    const markup = render(createElement(LinkAccountForm, { variant: "hero" }));

    expect(markup).toMatch(/<form(?![^>]*action=)[^>]*>/);
    expect(formArgs()).toBeDefined();
  });

  it("還要選伺服器或出錯：留在表單裡（不關視窗、不換頁）", async () => {
    render(createElement(CookieLinkForm, { onDone: vi.fn() }));
    const [step, , isDone] = formArgs();
    vi.mocked(linkAccountAction).mockResolvedValue({ roles: ROLES });

    expect(await step({}, form({ cookie: "ltoken_v2=x; ltuid_v2=1" }))).toEqual({ roles: ROLES });
    expect(isDone!({ roles: ROLES })).toBe(false);
    expect(isDone!({ error: "這個 HoYoLAB 帳號底下沒有星穹鐵道角色" })).toBe(false);
    expect(isDone!(LINKED)).toBe(true);
  });

  it("視窗裡連結好了：關掉視窗（按鈕旁不留訊息）、結果用提示視窗（cookie 少了建議的鍵時另外一則提醒）、導向剛連結的帳號並捲回最上面", () => {
    render(createElement(LinkAccountForm, { variant: "button" }));
    const [, onDone] = formArgs();

    onDone(LINKED.message, LINKED);

    expect(done).toHaveBeenCalledExactlyOnceWith();
    expect(toasts).toEqual([
      { tone: "success", title: LINKED.message },
      { tone: "warning", title: LINKED.warning },
    ]);
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/starrail?account=9");
  });

  it("還沒有帳號時大卡片打開的視窗連結好了：一樣關掉視窗、用提示視窗並導向剛連結的帳號；沒有要提醒的就只有一則", () => {
    render(createElement(LinkAccountForm, { variant: "hero" }));
    const [, onDone] = formArgs();

    onDone("已連結 開拓者（台港澳服，900000001）", { message: "已連結 開拓者（台港澳服，900000001）", accountId: 4 });

    expect(done).toHaveBeenCalledExactlyOnceWith();
    expect(toasts).toEqual([{ tone: "success", title: "已連結 開拓者（台港澳服，900000001）" }]);
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/starrail?account=4");
  });
});

describe("帳號密碼登入的表單", () => {
  const formArgs = () => vi.mocked(dialog.useDialogForm).mock.calls.at(-1) as unknown as Parameters<typeof dialog.useDialogForm<import("../../actions").LoginState>>;
  const sentDeviceIds = () => vi.mocked(loginAccountAction).mock.calls.map(([, data]) => data.get("deviceId"));

  beforeEach(() => {
    vi.mocked(dialog.useDialogForm).mockClear();
    vi.mocked(loginAccountAction).mockReset();
  });

  it("每一步都帶著同一個 device id（16 個小寫英數字）：換了 HoYoverse 會當成新的裝置，又要 email 驗證", async () => {
    render(createElement(LoginLinkForm, { onRoles: vi.fn(), onDone: vi.fn() }));
    const [step] = formArgs();
    vi.mocked(loginAccountAction).mockResolvedValueOnce({ verify: "{}" }).mockResolvedValueOnce({ error: "email 驗證碼錯了或過期了，請重新輸入" });

    await step({}, form({ account: "me@example.com", password: "pw" }));
    await step({ verify: "{}" }, form({ account: "me@example.com", password: "pw", verify: "{}", code: "123456" }));

    const [first, second] = sentDeviceIds();
    expect(first).toMatch(/^[a-z0-9]{16}$/);
    expect(second).toBe(first);
  });

  it("乘車證上的軌道：帳號、驗證、伺服器三站，剛打開時在第一站（aria-current）", () => {
    const markup = render(createElement(LoginLinkForm, { onRoles: vi.fn(), onDone: vi.fn() }));

    expect(textOf(markup.match(/<ol[^>]*>.*?<\/ol>/)![0], { spaced: true }).trim()).toBe("帳號 驗證 伺服器");
    expect(markup).toMatch(/<li[^>]*aria-current="step"[^>]*>(?:(?!<\/li>).)*帳號/);
  });

  it("要圖形驗證、要 email 驗證、選伺服器或出錯：留在表單裡；連結好了才算完成", () => {
    render(createElement(LoginLinkForm, { onRoles: vi.fn(), onDone: vi.fn() }));
    const [, , isDone] = formArgs();

    expect(isDone!({ captcha: { sessionId: "s", captchaId: "c", riskType: "slide", script: "https://static.geetest.com/v4/gt4.js" } })).toBe(false);
    expect(isDone!({ verify: "{}" })).toBe(false);
    expect(isDone!({ roles: ROLES, cookie: "ltoken_v2=x" })).toBe(false);
    expect(isDone!({ error: "帳號或密碼錯誤" })).toBe(false);
    expect(isDone!(LINKED)).toBe(true);
  });

  it("好幾個伺服器都有角色：cookie 與清單交給選伺服器的步驟（跟貼上 cookie 的一樣）", async () => {
    const onRoles = vi.fn();
    render(createElement(LoginLinkForm, { onRoles, onDone: vi.fn() }));
    const [step] = formArgs();
    vi.mocked(loginAccountAction).mockResolvedValue({ roles: ROLES, cookie: "ltoken_v2=x; stoken=y" });

    await step({}, form({ account: "me@example.com", password: "pw" }));

    expect(onRoles).toHaveBeenCalledWith(ROLES, "ltoken_v2=x; stoken=y");
  });
});
