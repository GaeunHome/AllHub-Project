import { createElement, isValidElement, useActionState, useId, useLayoutEffect, useRef, useState, type EffectCallback, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "../ui/dialog";

// 連結只有送出之後才有：直接給 useActionState 一個送出後的狀態，看畫面怎麼顯示；其他照 React 原本的實作
vi.mock("react", { spy: true });
vi.mock("./actions", () => ({ createInviteAction: vi.fn() }));

const { CreateInviteForm, inviteResult, keepLastLink } = await import("./create-invite-form");
const { createInviteAction } = await import("./actions");

const LINK = `https://hub.example.com/register?code=${"T".repeat(43)}`;
const CREATED = { message: "已建立邀請連結：7 天內可以註冊 1 個帳號。", link: LINK };
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const created = (state: object = CREATED) => vi.mocked(useActionState).mockReturnValueOnce([state, vi.fn(), false]);
const reopenButtonOf = (markup: string) => markup.match(/<button[^>]*aria-haspopup="dialog"[^>]*>/)![0];
const dialogOf = (markup: string) => markup.slice(markup.indexOf("<dialog"), markup.indexOf("</dialog>") + "</dialog>".length);

const LIVE = /\s(?:role="(?:status|alert|log)"|aria-live="(?:polite|assertive)")/;
const VOID_TAGS = new Set(["area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** 標記裡的每個 live region 與它外面的 live region、按鈕：live region 包著 live region 時，裡面一變外層也會再念一次 */
function liveRegions(markup: string) {
  const stack: { tag: string; live: boolean }[] = [];
  const regions: { tag: string; text: string; enclosedBy: string[] }[] = [];
  for (const match of markup.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const [, closing, tag, attributes] = match;
    if (closing) {
      while (stack.length > 0 && stack.pop()!.tag !== tag);
      continue;
    }
    const live = LIVE.test(attributes);
    if (live) {
      const rest = markup.slice(match.index + match[0].length);
      regions.push({ tag, text: textOf(rest.slice(0, rest.indexOf(`</${tag}>`))), enclosedBy: stack.filter((s) => s.live || s.tag === "button").map((s) => s.tag) });
    }
    if (!VOID_TAGS.has(tag) && !attributes.endsWith("/")) stack.push({ tag, live });
  }
  return regions;
}

/** 元件回傳的樹裡第一個符合條件的元素 */
function find(node: ReactNode, match: (type: unknown, props: Record<string, unknown>) => boolean): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) return node.map((child) => find(child, match)).find(Boolean) ?? null;
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (match(node.type, node.props)) return node;
  return find(node.props.children as ReactNode, match);
}

beforeEach(() => {
  vi.mocked(useActionState).mockReset();
  vi.mocked(useState).mockReset();
  vi.mocked(useId).mockReset();
  vi.mocked(useRef).mockReset();
  vi.mocked(useLayoutEffect).mockReset();
});

/** 直接呼叫元件（不經 React 算繪）時，其餘的 hook 給最簡單的替身：ref 照初始值、layout effect 先收起來 */
function callDirectly(effects: EffectCallback[] = []) {
  vi.mocked(useRef).mockImplementation(((initial: unknown) => ({ current: initial })) as never);
  vi.mocked(useLayoutEffect).mockImplementation((effect) => {
    effects.push(effect);
  });
  return CreateInviteForm();
}

/** 送進 useActionState 的 action：表單送出、離開這一頁時呼叫的都是它 */
function formAction() {
  type Action = (previous: object, payload: unknown) => object | Promise<object>;
  let action: Action | undefined;
  vi.mocked(useActionState).mockImplementationOnce((fn) => {
    action = fn as unknown as Action;
    return [{}, vi.fn(), false];
  });
  renderToStaticMarkup(createElement(CreateInviteForm));
  return action!;
}

describe("建立邀請連結後的畫面", () => {
  it("剛建立：視窗打開（寬一點，網址看得完整），裡面是唯讀的完整連結；「再看一次連結」標著已展開並指向這個視窗", () => {
    created();

    const markup = renderToStaticMarkup(createElement(CreateInviteForm));

    const dialog = markup.match(/<dialog[^>]*>/)![0];
    expect(dialog).toContain("dialog-lg");
    const id = dialog.match(/id="([^"]+)"/)![1];
    const reopen = reopenButtonOf(markup);
    expect(reopen).toContain('aria-expanded="true"');
    expect(reopen).toContain(`aria-controls="${id}"`);
    const field = markup.slice(markup.indexOf("<dialog")).match(/<textarea[^>]*aria-label="邀請連結"[^>]*>([^<]*)<\/textarea>/)!;
    expect(field[0]).toContain('readOnly=""');
    expect(field[1]).toBe(LINK);
  });

  it("報讀器：打開時連同標題念出建立的結果與「只在這一頁看得到」（視窗的 aria-describedby；內容跟視窗一起出現，live region 來不及念）", () => {
    created();

    const dialog = dialogOf(renderToStaticMarkup(createElement(CreateInviteForm)));

    const ids = dialog.match(/^<dialog[^>]*aria-describedby="([^"]+)"/)![1].split(" ");
    const described = ids.map((id) => {
      const element = new RegExp(`<(\\w+)[^>]*id="${id}"[^>]*>(.*?)</\\1>`).exec(dialog);
      expect(element, `找不到 id="${id}"`).not.toBeNull();
      return textOf(element![2]);
    });
    expect(described.join("")).toBe(`${CREATED.message}只在這一頁看得到，重新整理或離開就沒了`);
  });

  it("報讀器：視窗裡只有複製的結果一個 live region，不包在別的 live region 或按鈕裡（巢狀時「已複製」會念兩次）", () => {
    created();

    const regions = liveRegions(dialogOf(renderToStaticMarkup(createElement(CreateInviteForm))));

    expect(regions).toEqual([{ tag: "span", text: "", enclosedBy: [] }]);
  });

  it("視窗裡的說明不重複：建立的結果一次、「只在這一頁看得到」一次", () => {
    created();

    const text = textOf(renderToStaticMarkup(createElement(CreateInviteForm)));

    expect(text.match(/已建立邀請連結/g)).toHaveLength(1);
    expect(text.match(/只在這一頁看得到，重新整理或離開就沒了/g)).toHaveLength(1);
    expect(text).not.toContain("只會顯示這一次");
  });

  it("關掉視窗後：視窗收起、「再看一次連結」標著沒展開，表單下方說已建立", () => {
    created();
    vi.mocked(useState).mockReturnValueOnce([LINK, vi.fn()]);

    const markup = renderToStaticMarkup(createElement(CreateInviteForm));

    expect(reopenButtonOf(markup)).toContain('aria-expanded="false"');
    expect(markup).not.toContain('aria-label="邀請連結"');
    expect(textOf(markup)).toContain("已建立邀請連結，可以在下面的清單撤銷");
  });

  it("關掉視窗時記下是哪一條（不再自動打開）；「再看一次連結」清掉紀錄、重新打開", () => {
    const setClosedLink = vi.fn();
    created();
    vi.mocked(useState).mockReturnValueOnce([undefined, setClosedLink]);
    vi.mocked(useId).mockReturnValueOnce("invite-dialog");

    const tree = callDirectly();
    const dialog = find(tree, (type) => type === Dialog)!;
    const reopen = find(tree, (type, props) => type === "button" && props["aria-haspopup"] === "dialog")!;

    (dialog.props.onClose as () => void)();
    expect(setClosedLink).toHaveBeenLastCalledWith(LINK);
    (reopen.props.onClick as () => void)();
    expect(setClosedLink).toHaveBeenLastCalledWith(undefined);
  });

  it("建立下一條失敗：錯誤顯示在表單下方，上一條連結還能再看一次", () => {
    created({ error: "建立邀請連結失敗（詳見伺服器 log）", ...CREATED });
    vi.mocked(useState).mockReturnValueOnce([LINK, vi.fn()]);

    const markup = renderToStaticMarkup(createElement(CreateInviteForm));

    expect(markup).toMatch(/role="alert"[^>]*>.*建立邀請連結失敗/);
    expect(reopenButtonOf(markup)).toContain('aria-expanded="false"');
  });
});

describe("建立失敗時保留上一條連結（keepLastLink）", () => {
  it("表單送出的就是包著它的版本：下一條建立失敗，上一條連結還留在畫面的狀態裡", async () => {
    type Submit = (previous: object, formData: FormData) => Promise<object>;
    let submit: Submit | undefined;
    vi.mocked(useActionState).mockImplementationOnce((action) => {
      submit = action as unknown as Submit;
      return [{}, vi.fn(), false];
    });
    renderToStaticMarkup(createElement(CreateInviteForm));
    vi.mocked(createInviteAction).mockResolvedValueOnce({ error: "建立邀請連結失敗（詳見伺服器 log）" });

    expect(await submit!(CREATED, new FormData())).toEqual({ error: "建立邀請連結失敗（詳見伺服器 log）", ...CREATED });
  });

  it("建立下一條時不把上一條連結送回伺服器：完整的連結只在建立的回應裡出現一次", async () => {
    const submit = formAction();
    const formData = new FormData();
    vi.mocked(createInviteAction).mockClear().mockResolvedValueOnce({ error: "建立邀請連結失敗（詳見伺服器 log）" });

    expect(await submit(CREATED, formData)).toEqual({ error: "建立邀請連結失敗（詳見伺服器 log）", ...CREATED });
    expect(createInviteAction).toHaveBeenCalledExactlyOnceWith({}, formData);
  });

  it("這次失敗、之前有連結：留著上一條連結與它的說明，加上這次的錯誤", () => {
    expect(keepLastLink(CREATED, { error: "建立邀請連結失敗（詳見伺服器 log）" })).toEqual({ error: "建立邀請連結失敗（詳見伺服器 log）", ...CREATED });
  });

  it("這次成功：換成新的連結", () => {
    const next = { message: "已建立邀請連結：30 天內可以註冊 5 個帳號。", link: `${LINK}2` };

    expect(keepLastLink(CREATED, next)).toEqual(next);
  });

  it("之前沒有連結：照這次的結果", () => {
    expect(keepLastLink({}, { error: "請重新整理頁面" })).toEqual({ error: "請重新整理頁面" });
  });
});

describe("建立失敗、上一條還在時（inviteResult）", () => {
  it("錯誤顯示在表單下方、可以再看一次上一條；視窗不自動打開", () => {
    expect(inviteResult({ error: "建立邀請連結失敗（詳見伺服器 log）", ...CREATED }, LINK)).toEqual({
      dialogOpen: false,
      canReopen: true,
      feedback: { error: "建立邀請連結失敗（詳見伺服器 log）" },
    });
  });
});

describe("離開這一頁就看不到連結（Activity 把頁面藏起來時）", () => {
  /** 跑完 layout effect 再跑它們的清除函式：Activity 把頁面藏起來（例如點導覽列換頁）時就是這樣；回傳送給 useActionState 的東西 */
  function hide(state: object) {
    const dispatch = vi.fn();
    vi.mocked(useActionState).mockReturnValueOnce([state, dispatch, false]);
    vi.mocked(useState).mockReturnValueOnce([undefined, vi.fn()]);
    vi.mocked(useId).mockReturnValueOnce("invite-dialog");
    const effects: EffectCallback[] = [];

    callDirectly(effects);
    const cleanups = effects.map((effect) => effect());
    for (const cleanup of cleanups) cleanup?.();
    return dispatch;
  }

  it("藏起來時忘掉畫面上的那一條連結：回到這一頁（上一頁或導覽列的連結）就沒了，跟畫面上寫的一樣", () => {
    expect(hide(CREATED)).toHaveBeenCalledExactlyOnceWith({ forget: LINK });
  });

  it("還沒建立連結時藏起來：不送任何東西（按鈕不會閃一下「建立中…」）", () => {
    expect(hide({})).not.toHaveBeenCalled();
  });

  it("忘掉：連結、說明與錯誤一起清掉，不能再看一次", async () => {
    const forget = formAction();

    expect(await forget({ error: "建立邀請連結失敗（詳見伺服器 log）", ...CREATED }, { forget: LINK })).toEqual({});
  });

  it("已經換成新的連結才收到舊的那條要忘掉：新的不動", async () => {
    const forget = formAction();
    const next = { message: "已建立邀請連結：30 天內可以註冊 5 個帳號。", link: `${LINK}2` };

    expect(await forget(next, { forget: LINK })).toEqual(next);
  });
});
