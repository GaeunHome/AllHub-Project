import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireOwner } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./cached", () => ({ cachedUsers: vi.fn(), cachedInvites: vi.fn() }));
vi.mock("./service", () => ({ listLockedUsers: vi.fn() }));
vi.mock("./actions", () => ({ createInviteAction: vi.fn(), revokeInviteAction: vi.fn(), setUserDisabledAction: vi.fn(), deleteUserAction: vi.fn(), unlockUserAction: vi.fn() }));

const cached = mocksOf(await import("./cached"), "cachedUsers", "cachedInvites");
const service = mocksOf(await import("./service"), "listLockedUsers");
const { AdminPage, InviteSection, UserSection } = await import("./admin-page");
const { inviteResult } = await import("./create-invite-form");

const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const MEMBER_ID = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";
const DISABLED_ID = "3b4c5d6e-7f8a-4b9c-8d0e-1f2a3b4c5d6e";

const invite = (overrides: Record<string, unknown>) => ({
  id: 1,
  note: null,
  createdBy: "alice",
  createdAt: at(-DAY),
  expiresAt: at(DAY),
  maxUses: 5,
  usedCount: 0,
  revokedAt: null,
  ...overrides,
});

beforeEach(() => {
  requireOwner.mockReset();
  cached.cachedUsers.mockReset().mockResolvedValue([
    { id: TEST_SESSION.id, username: "alice", role: "owner", createdAt: new Date("2026-01-02T03:04:00Z"), disabledAt: null },
    { id: MEMBER_ID, username: "bob", role: "member", createdAt: new Date("2026-10-01T00:00:00Z"), disabledAt: null },
    { id: DISABLED_ID, username: "carol", role: "member", createdAt: new Date("2026-10-02T00:00:00Z"), disabledAt: new Date("2026-10-05T00:00:00Z") },
  ]);
  cached.cachedInvites.mockReset().mockResolvedValue([]);
  service.listLockedUsers.mockReset().mockResolvedValue([]);
});

describe("管理頁：使用者", () => {
  it("先確認是站長才讀資料", async () => {
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT:/"));

    await expect(UserSection()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(cached.cachedUsers).not.toHaveBeenCalled();
  });

  it("列出帳號、角色與建立時間；自己那一列沒有停用與刪除", async () => {
    const markup = renderToStaticMarkup((await UserSection()) as ReactElement);
    const text = textOf(markup);

    expect(text).toContain("alice");
    expect(text).toContain("（你）");
    expect(text).toContain("站長");
    expect(text).toContain("成員");
    expect(text).toContain("2026/1/2 11:04");
    expect(markup).not.toContain(`value="${TEST_SESSION.id}"`);
  });

  it("其他人可以停用或刪除；已停用的標示出來並可以恢復", async () => {
    const markup = renderToStaticMarkup((await UserSection()) as ReactElement);
    const text = textOf(markup);

    expect(markup).toContain(`value="${MEMBER_ID}"`);
    expect(markup).toContain(`value="${DISABLED_ID}"`);
    expect(text).toContain("已停用");
    expect(text).toContain("停用");
    expect(text).toContain("恢復");
    expect(text).toContain("刪除");
  });
});

describe("管理頁：登入鎖定", () => {
  it("被鎖定的帳號顯示「鎖定中，到 HH:mm」（台北時間）與「解除鎖定」；鎖定狀態每次直接讀，不走快取", async () => {
    service.listLockedUsers.mockResolvedValue([{ id: MEMBER_ID, lockedUntil: new Date("2026-10-08T07:45:00Z") }]);

    const markup = renderToStaticMarkup((await UserSection()) as ReactElement);
    const text = textOf(markup);

    expect(service.listLockedUsers).toHaveBeenCalledWith(expect.any(Date));
    expect(text).toContain("鎖定中，到 15:45");
    expect(text.match(/解除鎖定/g)).toHaveLength(1);
    const bobRow = markup.split("<li").find((row) => row.includes("bob"))!;
    expect(bobRow).toContain("解除鎖定");
    expect(bobRow).toContain("鎖定中，到 15:45");
  });

  it("沒有被鎖定的帳號_沒有鎖定標示，也沒有解除鎖定", async () => {
    const text = textOf(renderToStaticMarkup((await UserSection()) as ReactElement));

    expect(text).not.toContain("鎖定中");
    expect(text).not.toContain("解除鎖定");
  });

  it("自己那一列不顯示鎖定標示與解除鎖定（站長被鎖時本來就進不了管理頁）", async () => {
    service.listLockedUsers.mockResolvedValue([{ id: TEST_SESSION.id, lockedUntil: new Date("2026-10-08T08:00:00Z") }]);

    const markup = renderToStaticMarkup((await UserSection()) as ReactElement);

    expect(textOf(markup)).not.toContain("鎖定中");
    expect(markup).not.toContain(`value="${TEST_SESSION.id}"`);
  });
});

describe("管理頁：邀請", () => {
  it("建立邀請的表單：期限 1／7／30 天、次數 1／5／10 次、備註", async () => {
    const markup = renderToStaticMarkup((await InviteSection()) as ReactElement);

    for (const days of ["1", "7", "30"]) expect(markup).toMatch(new RegExp(`<input[^>]*name="days"[^>]*value="${days}"|<input[^>]*value="${days}"[^>]*name="days"`));
    for (const uses of ["1", "5", "10"]) expect(markup).toMatch(new RegExp(`<input[^>]*name="uses"[^>]*value="${uses}"|<input[^>]*value="${uses}"[^>]*name="uses"`));
    expect(markup).toMatch(/name="note"/);
  });

  it("列出有效、過期、撤銷、用完的邀請；只有有效的可以撤銷", async () => {
    cached.cachedInvites.mockResolvedValue([
      invite({ id: 11, note: "給小明", usedCount: 1 }),
      invite({ id: 12, expiresAt: at(-1000) }),
      invite({ id: 13, revokedAt: at(-1000) }),
      invite({ id: 14, usedCount: 5 }),
    ]);

    const markup = renderToStaticMarkup((await InviteSection()) as ReactElement);
    const text = textOf(markup);

    for (const label of ["有效", "已過期", "已撤銷", "已用完", "給小明", "已用 1／5 次"]) expect(text).toContain(label);
    expect(markup).toContain('value="11"');
    for (const id of ["12", "13", "14"]) expect(markup).not.toMatch(new RegExp(`name="inviteId"[^>]*value="${id}"|value="${id}"[^>]*name="inviteId"`));
  });
});

describe("建立邀請後的畫面（inviteResult）", () => {
  const LINK = "https://hub.example.com/register?code=new";
  const created = { message: "已建立邀請連結：7 天內可以註冊 1 個帳號。", link: LINK };

  it("還沒建立或出錯：不開視窗，錯誤顯示在表單下方", () => {
    expect(inviteResult({}, undefined)).toEqual({ dialogOpen: false, canReopen: false, feedback: {} });
    expect(inviteResult({ error: "建立邀請連結失敗（詳見伺服器 log）" }, undefined)).toEqual({ dialogOpen: false, canReopen: false, feedback: { error: "建立邀請連結失敗（詳見伺服器 log）" } });
  });

  it("再建立一條：新的連結照樣自動打開", () => {
    expect(inviteResult({ ...created, link: `${LINK}2` }, LINK)).toMatchObject({ dialogOpen: true });
  });
});

describe("管理頁的外框", () => {
  it("寬螢幕：邀請連結與使用者兩欄等寬（邀請清單的每一列不會擠成三行），頁首撐滿；排欄不靠第幾個子元素", () => {
    const page = AdminPage() as ReactElement<{ className: string; children: ReactNode[] }>;
    const classes = page.props.className.split(" ");

    expect(classes).toEqual(expect.arrayContaining(["xl:grid", "xl:grid-cols-2", "xl:items-start"]));
    expect(classes.filter((c) => /(?:nth|last|only)-child/.test(c))).toEqual([]);
    const sections = page.props.children.filter((child) => isValidElement<{ "aria-labelledby"?: string }>(child) && child.type === "section");
    expect(sections.map((section) => (section as ReactElement<{ "aria-labelledby": string }>).props["aria-labelledby"])).toEqual(["admin-invites", "admin-users"]);
  });
});
