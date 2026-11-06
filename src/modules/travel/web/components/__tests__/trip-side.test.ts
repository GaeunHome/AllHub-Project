import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../actions", () => ({ addCheckAction: vi.fn(), deleteCheckAction: vi.fn(), removeMemberAction: vi.fn(), setCheckDoneAction: vi.fn(), setJoinLinkAction: vi.fn() }));

const { Checklist, Members } = await import("../trip-side");

const CHECKS = [{ id: 1, title: "護照", done: true }, { id: 2, title: "網卡", done: false }, { id: 3, title: "換日幣", done: false }];
const MEMBERS = [{ id: "u", username: "owner", name: "小明", avatar: null }, { id: "v", username: "friend", name: "小華", avatar: null }];

describe("同行的人與出發前清單平常收起來（使用者要的：不佔版面）", () => {
  it("清單打開頁面時是收著的 收著也看得到還剩幾項", () => {
    const page = markup(createElement(Checklist, { tripId: 1, checks: CHECKS }));

    expect(page).toMatch(/<details(?![^>]*\bopen\b)/);
    expect(textOf(page.match(/<summary.*?<\/summary>/)?.[0] ?? "")).toContain("還有 2 項");
  });

  it("同行的人打開頁面時是收著的 收著也看得到幾個人", () => {
    const page = markup(createElement(Members, { tripId: 1, members: MEMBERS, managerId: "u", userId: "u", joinPath: null }));

    expect(page).toMatch(/<details(?![^>]*\bopen\b)/);
    expect(textOf(page.match(/<summary.*?<\/summary>/)?.[0] ?? "")).toContain("2 人");
  });
});
