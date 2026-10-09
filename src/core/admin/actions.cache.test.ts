import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../auth/invites", { spy: true });
vi.mock("./service", { spy: true });
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://hub.example.com" }) }));

const invites = mocksOf(await import("../auth/invites"), "createInvite", "revokeInvite");
const service = mocksOf(await import("./service"), "setUserDisabled", "deleteUser", "unlockUser");
const actions = await import("./actions");

const MEMBER_ID = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";

beforeEach(() => {
  invites.createInvite.mockReset().mockResolvedValue({ token: "T".repeat(43), id: 1, expiresAt: new Date() });
  invites.revokeInvite.mockReset().mockResolvedValue(true);
  service.setUserDisabled.mockReset().mockResolvedValue(true);
  service.deleteUser.mockReset().mockResolvedValue(true);
  service.unlockUser.mockReset().mockResolvedValue(true);
});

describe("管理頁的 Server Action：寫入後用 updateTag 讓對應的清單失效", () => {
  it.each([
    ["createInviteAction", ["core:invites"], () => actions.createInviteAction({}, form({ days: "7", uses: "1", note: "" }))],
    ["revokeInviteAction", ["core:invites"], () => actions.revokeInviteAction({}, form({ inviteId: "1" }))],
    ["setUserDisabledAction", ["core:users"], () => actions.setUserDisabledAction({}, form({ userId: MEMBER_ID, disabled: "true" }))],
    // 刪除帳號時，他建立的邀請也跟著外鍵刪掉
    ["deleteUserAction", ["core:invites", "core:users"], () => actions.deleteUserAction({}, form({ userId: MEMBER_ID }))],
    ["unlockUserAction", ["core:users"], () => actions.unlockUserAction({}, form({ userId: MEMBER_ID }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    await run();

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["revokeInviteAction", () => (invites.revokeInvite.mockResolvedValue(false), actions.revokeInviteAction({}, form({ inviteId: "1" })))],
    ["setUserDisabledAction", () => (service.setUserDisabled.mockResolvedValue(false), actions.setUserDisabledAction({}, form({ userId: MEMBER_ID, disabled: "true" })))],
    ["deleteUserAction", () => (service.deleteUser.mockResolvedValue(false), actions.deleteUserAction({}, form({ userId: MEMBER_ID })))],
    ["unlockUserAction", () => (service.unlockUser.mockResolvedValue(false), actions.unlockUserAction({}, form({ userId: MEMBER_ID })))],
  ] as const)("%s_要改的資料已經不在了_沒有寫入就不失效，用 refresh 重新算繪", async (_name, run) => {
    await run();

    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
