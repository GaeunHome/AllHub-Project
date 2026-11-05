import { refresh, revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../service/trips", { spy: true });
vi.mock("../../service/items", { spy: true });
vi.mock("../../service/extras", { spy: true });

const trips = mocksOf(await import("../../service/trips"), "createTrip", "updateTrip", "deleteTrip", "leaveTrip", "removeMember", "setJoinLink", "joinTrip");
const items = mocksOf(await import("../../service/items"), "addItem", "updateItem", "deleteItem", "moveItem");
const extras = mocksOf(await import("../../service/extras"), "addComment", "deleteComment", "addCheck", "setCheckDone", "deleteCheck");
const actions = await import("../actions");

const MEMBER = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";
const ok = (run: () => Promise<{ error?: string }>) => run().catch((error: Error) => (error.message.startsWith("NEXT_REDIRECT") ? {} : { error: error.message }));

beforeEach(() => {
  for (const group of [trips, items, extras]) for (const fn of Object.values(group)) fn.mockReset().mockResolvedValue({ id: 1, title: "京都" } as never);
});

describe("旅遊的 Server Action：寫入後讓對應的 tag 失效", () => {
  it.each([
    ["createTripAction", ["travel:members", "travel:trips"], () => actions.createTripAction({}, form({}))],
    ["updateTripAction", ["travel:items", "travel:trips"], () => actions.updateTripAction({}, form({ tripId: "1" }))],
    ["deleteTripAction", ["travel:checks", "travel:comments", "travel:items", "travel:members", "travel:trips"], () => actions.deleteTripAction({}, form({ tripId: "1" }))],
    ["leaveTripAction", ["travel:members", "travel:trips"], () => actions.leaveTripAction({}, form({ tripId: "1" }))],
    ["removeMemberAction", ["travel:members"], () => actions.removeMemberAction({}, form({ tripId: "1", memberId: MEMBER }))],
    ["setJoinLinkAction", ["travel:trips"], () => actions.setJoinLinkAction({}, form({ tripId: "1", open: "true" }))],
    ["joinTripAction", ["travel:members", "travel:trips"], () => actions.joinTripAction({}, form({ tripId: "1", token: "t" }))],
    ["addItemAction", ["travel:items"], () => actions.addItemAction({}, form({ tripId: "1" }))],
    ["updateItemAction", ["travel:items"], () => actions.updateItemAction({}, form({ tripId: "1", itemId: "2", version: "1" }))],
    ["deleteItemAction", ["travel:comments", "travel:items"], () => actions.deleteItemAction(1, {}, form({ id: "2" }))],
    ["moveItemAction", ["travel:items"], () => actions.moveItemAction(1, 2, "2026-12-01", null)],
    ["addCommentAction", ["travel:comments"], () => actions.addCommentAction({}, form({ tripId: "1", itemId: "2" }))],
    ["deleteCommentAction", ["travel:comments"], () => actions.deleteCommentAction({}, form({ tripId: "1", commentId: "2" }))],
    ["addCheckAction", ["travel:checks"], () => actions.addCheckAction({}, form({ tripId: "1" }))],
    ["setCheckDoneAction", ["travel:checks"], () => actions.setCheckDoneAction({}, form({ tripId: "1", checkId: "2", done: "true" }))],
    ["deleteCheckAction", ["travel:checks"], () => actions.deleteCheckAction({}, form({ tripId: "1", checkId: "2" }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    expect((await ok(run)).error).toBeUndefined();

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("送來的值都不可信", () => {
  it("拖曳送來的日期格式不對：當成想去的點，不把怪值放進查詢", async () => {
    await actions.moveItemAction(1, 2, "'; drop table--", null);

    expect(items.moveItem.mock.calls[0][3]).toBeNull();
  });

  it("旅程 id 格式不對：跟別人的旅程一樣回找不到，不碰 service", async () => {
    expect(await actions.addItemAction({}, form({ tripId: "abc" }))).toEqual({ error: "找不到這趟旅程，請重新整理頁面" });
    expect(items.addItem).not.toHaveBeenCalled();
  });
});
