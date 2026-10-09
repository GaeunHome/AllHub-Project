import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
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
const { InviteCreated } = await import("./create-invite-form");
const { disableConfirmMessage } = await import("./user-list");

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

describe("停用的確認訊息", () => {
  it("說清楚停用等於凍結：立刻登出、不能登入、排程與通知暫停；資料與訂閱保留，恢復後要重新登入", () => {
    expect(disableConfirmMessage("bob")).toBe("確定停用「bob」？停用後他會立刻被登出、不能再登入，排程與通知也會暫停；資料與追蹤的訂閱都會保留，恢復後要重新登入。");
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

  it("還沒有邀請_顯示空狀態", async () => {
    expect(textOf(renderToStaticMarkup((await InviteSection()) as ReactElement))).toContain("還沒有邀請連結");
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

describe("建立後顯示的邀請連結", () => {
  it("唯讀的完整連結、複製按鈕，並提醒只會顯示這一次", () => {
    const link = `https://hub.example.com/register?code=${"T".repeat(43)}`;

    const markup = renderToStaticMarkup(createElement(InviteCreated, { link }));

    const inputs = markup.match(/<input[^>]*>/g) ?? [];
    expect(inputs.some((tag) => tag.includes("readOnly") && tag.includes(`value="${link}"`))).toBe(true);
    expect(textOf(markup)).toContain("複製連結");
    expect(textOf(markup)).toContain("只會顯示這一次");
  });
});

/** 頁面外框裡寫死的文字；讀資料的區塊在 Suspense 裡，不實際算繪 */
function staticText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(staticText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return staticText(node.props.children);
  return "";
}

describe("管理頁的外框", () => {
  it("各功能的資料已經依帳號分開：不再提醒「先不要邀請別人」", () => {
    const text = staticText(AdminPage());

    expect(text).toContain("邀請連結");
    expect(text).not.toContain("先不要邀請別人");
    expect(text).not.toContain("還沒有依帳號分開");
  });
});
