import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "@/dev/test-helpers";
import { toasts } from "@/dev/toast-stub";

vi.mock("../actions", () => ({ createInviteAction: vi.fn() }));
vi.mock("../../ui/toast", () => import("@/dev/toast-stub"));

const { CreateInvite, InviteLinkDialog, announceOnce, forgetCreated, submitInvite } = await import("../create-invite-form");
const { createInviteAction } = await import("../actions");

const MODULES = [{ id: "twitch", name: "Twitch", icon: "/icons/brands/twitch.svg" as const }];
const LINK = `https://hub.example.com/register?code=${"T".repeat(43)}`;
const CREATED = { message: "已建立邀請連結：7 天內可以註冊 1 個帳號。", link: LINK };
const FAILED = { error: "建立邀請連結失敗（詳見伺服器 log）" };

const LIVE = /\s(?:role="(?:status|alert|log)"|aria-live="(?:polite|assertive)")/;
const VOID_TAGS = new Set(["area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** 列出每個 live region 和包著它的 live region 或按鈕 巢狀時裡面一變外層會再念一次 */
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

const linkDialog = () => renderToStaticMarkup(createElement(InviteLinkDialog, { id: "invite-link", created: CREATED, open: true, onClose: vi.fn() }));

beforeEach(() => {
  vi.mocked(createInviteAction).mockReset();
});

// 使用者覺得建立表單下面直接接著清單很醜 選了清單為主 按鈕打開視窗填表單
describe("建立邀請連結的按鈕", () => {
  it("一顆「建立邀請連結」打開視窗，表單不攤在頁面上；還沒建立過時沒有「再看一次連結」", () => {
    const markup = renderToStaticMarkup(createElement(CreateInvite, { modules: MODULES }));

    expect(markup).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>.*建立邀請連結<\/button>/);
    expect(markup).not.toContain('name="days"');
    expect(textOf(markup)).not.toContain("再看一次連結");
  });
});

describe("建立後跳出的連結（InviteLinkDialog）", () => {
  it("視窗寬一點（網址看得完整），裡面是唯讀的完整連結", () => {
    const markup = linkDialog();

    expect(markup.match(/<dialog[^>]*>/)![0]).toContain("dialog-lg");
    const field = markup.match(/<textarea[^>]*aria-label="邀請連結"[^>]*>([^<]*)<\/textarea>/)!;
    expect(field[0]).toContain('readOnly=""');
    expect(field[1]).toBe(LINK);
  });

  it("報讀器：打開時連同標題念出建立的結果與「只在這一頁看得到」（視窗的 aria-describedby；內容跟視窗一起出現，live region 來不及念）", () => {
    const dialog = linkDialog();

    const ids = dialog.match(/<dialog[^>]*aria-describedby="([^"]+)"/)![1].split(" ");
    const described = ids.map((id) => {
      const element = new RegExp(`<(\\w+)[^>]*id="${id}"[^>]*>(.*?)</\\1>`).exec(dialog);
      expect(element, `找不到 id="${id}"`).not.toBeNull();
      return textOf(element![2]);
    });
    expect(described.join("")).toBe(`${CREATED.message}只在這一頁看得到，重新整理或離開就沒了`);
  });

  it("報讀器：視窗裡只有複製的結果一個 live region，不包在別的 live region 或按鈕裡（巢狀時「已複製」會念兩次）", () => {
    const dialog = linkDialog();

    expect(liveRegions(dialog.slice(dialog.indexOf("<dialog")))).toEqual([{ tag: "span", text: "", enclosedBy: [] }]);
  });

  it("視窗裡的說明不重複：建立的結果一次、「只在這一頁看得到」一次", () => {
    const text = textOf(linkDialog());

    expect(text.match(/已建立邀請連結/g)).toHaveLength(1);
    expect(text.match(/只在這一頁看得到，重新整理或離開就沒了/g)).toHaveLength(1);
  });
});

describe("送出建立邀請（submitInvite）", () => {
  it("建立時不把上一條連結送回伺服器：完整的連結只在建立的回應裡出現一次", async () => {
    const formData = new FormData();
    vi.mocked(createInviteAction).mockResolvedValueOnce(FAILED);

    await submitInvite(vi.fn())(CREATED, formData);

    expect(createInviteAction).toHaveBeenCalledExactlyOnceWith({}, formData);
  });

  it("成功：連結交給畫面另外記（視窗自動打開），表單的狀態只留說明、不留連結", async () => {
    const onCreated = vi.fn();
    vi.mocked(createInviteAction).mockResolvedValueOnce(CREATED);

    expect(await submitInvite(onCreated)({}, new FormData())).toEqual({ message: CREATED.message });
    expect(onCreated).toHaveBeenCalledExactlyOnceWith({ link: LINK, message: CREATED.message });
  });

  it("失敗：錯誤留給表單（對著欄位修改），畫面上的上一條連結不動、還能再看一次", async () => {
    const onCreated = vi.fn();
    vi.mocked(createInviteAction).mockResolvedValueOnce(FAILED);

    expect(await submitInvite(onCreated)({}, new FormData())).toEqual(FAILED);
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("關掉建立結果的視窗時提示一次（announceOnce）", () => {
  it("第一次關掉提示已建立、可以在清單撤銷；再看一次後關掉不再提示；沒有連結時不提示", () => {
    const announced = { current: undefined as string | undefined };
    const notify = vi.fn();

    announceOnce(announced, LINK, notify);
    announceOnce(announced, LINK, notify);
    announceOnce(announced, undefined, notify);

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("新的一條連結關掉時照樣提示", () => {
    const announced = { current: LINK as string | undefined };
    const notify = vi.fn();

    announceOnce(announced, `${LINK}2`, notify);

    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("離開這一頁就看不到連結（Activity 把頁面藏起來時）", () => {
  it("藏起來時忘掉畫面上的連結並關掉視窗：回到這一頁就沒了，跟畫面上寫的一樣", () => {
    const setCreated = vi.fn();
    const setLinkOpen = vi.fn();

    forgetCreated({ announced: { current: undefined }, shownLink: { current: LINK }, setCreated, setLinkOpen })();

    expect(setCreated).toHaveBeenCalledExactlyOnceWith(null);
    expect(setLinkOpen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("藏起來時視窗跟著關掉：不會在換到的那一頁跳出「已建立邀請連結」的提示", () => {
    const announced = { current: undefined as string | undefined };
    const notify = vi.fn();

    forgetCreated({ announced, shownLink: { current: LINK }, setCreated: vi.fn(), setLinkOpen: vi.fn() })();
    announceOnce(announced, LINK, notify);

    expect(notify).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });
});
