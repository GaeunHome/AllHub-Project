import { Fragment, createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "@/dev/navigation-stub";
import { form, markup as render } from "@/dev/test-helpers";

vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
// 視窗關著時內容不算繪 換掉 DialogButton 才看得到裡面的表單
// 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("./link-result", { spy: true });
vi.mock("../actions", () => ({ linkAccountAction: vi.fn() }));

const dialog = await import("@/core/ui/dialog");
const linkResult = await import("./link-result");
const { linkAccountAction } = await import("../actions");
const { LinkAccountForm, RoleChooser } = await import("./link-account-form");

describe("連結 HoYoLAB 帳號的表單", () => {
  it("還沒有帳號_直接顯示貼 cookie 的表單", () => {
    const markup = render(createElement(LinkAccountForm, { defaultOpen: true }));

    expect(markup).toContain("連結 HoYoLAB 帳號");
    expect(markup).toContain('name="cookie"');
    expect(markup).not.toContain("<dialog");
  });

  it("已經有帳號_只有「新增帳號或更新 cookie」按鈕，表單在套星空配色與切角的彈出視窗裡、點了才出現", () => {
    const markup = render(createElement(LinkAccountForm, { defaultOpen: false }));

    expect(markup).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*新增帳號或更新 cookie/);
    expect(markup).toMatch(/<dialog[^>]*class="[^"]*sr-dialog/);
    // 星空底色由 sr-dialog 自己畫 theme-starrail 只能放在 PageTheme 上
    // 整頁主題掛在視窗上的話 換到別頁時會漏過去
    expect(markup).not.toMatch(/<dialog[^>]*theme-starrail/);
    expect(markup).not.toContain('name="cookie"');
    expect(markup).not.toContain("<details");
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

type Controls = { done: (message?: string) => void; close: () => void };
type FormArgs = Parameters<typeof dialog.useDialogForm<import("../actions").LinkState>>;
const ROLES = [{ uid: "900000001", server: "台港澳服", nickname: "開拓者", level: 70, selected: true }];
const LINKED = { message: "已連結 開拓者（台港澳服，900000001）", warning: "建議一併貼上 ltmid_v2，否則即時便箋可能失敗", accountId: 9 };

describe("連結帳號的表單送出後", () => {
  const done = vi.fn();
  const show = vi.fn();
  /** 這次算繪交給 useDialogForm 的 Server Action 完成處理與完成了沒的判斷 */
  const formArgs = () => vi.mocked(dialog.useDialogForm).mock.calls.at(-1) as unknown as FormArgs;

  beforeEach(() => {
    done.mockReset();
    show.mockReset();
    router.push.mockReset();
    vi.mocked(dialog.useDialogForm).mockClear();
    vi.mocked(linkResult.useShowLinkResult).mockReturnValue(show);
    vi.mocked(dialog.DialogButton).mockImplementation(({ children }) =>
      createElement(Fragment, null, typeof children === "function" ? (children as (controls: Controls) => ReactNode)({ done, close: vi.fn() }) : children),
    );
  });

  it("用 onSubmit 送出、不用 <form action>：React 送完會清空欄位，第二步失敗時勾選的伺服器會變回預設", () => {
    const markup = render(createElement(LinkAccountForm, { defaultOpen: true }));

    expect(markup).toMatch(/<form(?![^>]*action=)[^>]*>/);
    expect(formArgs()).toBeDefined();
  });

  it("還要選伺服器或出錯：留在表單裡（不關視窗、不換頁）", async () => {
    render(createElement(LinkAccountForm, { defaultOpen: false }));
    const [step, , isDone] = formArgs();
    vi.mocked(linkAccountAction).mockResolvedValue({ roles: ROLES });

    expect(await step({}, form({ cookie: "ltoken_v2=x; ltuid_v2=1" }))).toEqual({ roles: ROLES });
    expect(isDone!({ roles: ROLES })).toBe(false);
    expect(isDone!({ error: "這個 HoYoLAB 帳號底下沒有星穹鐵道角色" })).toBe(false);
    expect(isDone!(LINKED)).toBe(true);
  });

  it("視窗裡連結好了：關掉視窗（按鈕旁不再留訊息）、結果交給帳號分頁上方的橫幅、導向剛連結的帳號", () => {
    render(createElement(LinkAccountForm, { defaultOpen: false }));
    const [, onDone] = formArgs();

    onDone(LINKED.message, LINKED);

    expect(done).toHaveBeenCalledExactlyOnceWith();
    expect(show).toHaveBeenCalledExactlyOnceWith({ accountId: 9, message: LINKED.message, warning: LINKED.warning });
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/starrail?account=9", { scroll: false });
  });

  it("還沒有帳號時的整頁表單連結好了：一樣交給橫幅並導向剛連結的帳號", () => {
    render(createElement(LinkAccountForm, { defaultOpen: true }));
    const [, onDone] = formArgs();

    onDone("已連結 開拓者（台港澳服，900000001）", { message: "已連結 開拓者（台港澳服，900000001）", accountId: 4 });

    expect(show).toHaveBeenCalledExactlyOnceWith({ accountId: 4, message: "已連結 開拓者（台港澳服，900000001）", warning: undefined });
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/starrail?account=4", { scroll: false });
  });
});
