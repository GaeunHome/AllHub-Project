import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/streamers", { spy: true });

const service = mocksOf(await import("../service/streamers"), "addStreamer", "removeStreamer", "syncSubscriptionsFor", "setStreamerNotify");
const { TwitchUserError } = await import("../service/streamers");
const { addStreamerAction, removeStreamerAction, setStreamerNotifyAction, syncAction } = await import("./actions");

beforeEach(() => {
  service.addStreamer.mockReset().mockResolvedValue({ displayName: "Alice" });
  service.removeStreamer.mockReset().mockResolvedValue({});
  service.syncSubscriptionsFor.mockReset().mockResolvedValue("已同步你追蹤的 2 位主播，2 位訂閱正常");
  service.setStreamerNotify.mockReset().mockResolvedValue(true);
});

describe("Twitch 的 Server Action：寫入後用 updateTag 讓改到的表失效", () => {
  it.each([
    // 追蹤改的是追蹤表；第一次有人追蹤、最後一位取消時也會新增或刪除主播
    ["addStreamerAction", ["twitch:follows", "twitch:streamers"], () => addStreamerAction({}, form({ login: "alice" }))],
    ["removeStreamerAction", ["twitch:follows", "twitch:streamers"], () => removeStreamerAction({}, form({ id: "3" }))],
    ["syncAction", ["twitch:streamers"], () => syncAction()],
    // 通知開關記在自己的追蹤上
    ["setStreamerNotifyAction", ["twitch:follows"], () => setStreamerNotifyAction({}, form({ id: "3", enabled: "false" }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    await run();

    expect(updated()).toEqual([...tags]);
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經會讓這次回應帶著重新算繪的頁面，再呼叫 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });

  it("加入主播失敗（例如已經在追蹤）_仍讓列表失效：失敗前可能已經寫入一部分", async () => {
    service.addStreamer.mockRejectedValue(new TwitchUserError("已經在追蹤「Alice」了"));

    expect(await addStreamerAction({}, form({ login: "alice" }))).toEqual({ error: "已經在追蹤「Alice」了" });
    expect(updated()).toEqual(["twitch:follows", "twitch:streamers"]);
  });

  it.each([
    ["removeStreamerAction 的 id 不正確", () => removeStreamerAction({}, form({ id: "abc" }))],
    ["setStreamerNotifyAction 的 enabled 不正確", () => setStreamerNotifyAction({}, form({ id: "3", enabled: "yes" }))],
  ])("%s_沒寫入就不失效", async (_name, run) => {
    await run();

    expect(updateTag).not.toHaveBeenCalled();
  });
});
