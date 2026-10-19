import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureErrorLog, expiredTags, form, mocksOf, updated } from "@/dev/test-helpers";

const deferred = vi.hoisted(() => ({ tasks: [] as (() => unknown)[] }));

vi.mock("next/server", () => ({ after: (task: () => unknown) => deferred.tasks.push(task) }));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/channels", { spy: true });
vi.mock("../service/caption-status", { spy: true });
vi.mock("../service/translation", { spy: true });
vi.mock("../service/ai-settings", { spy: true });
vi.mock("../service/saved-videos", { spy: true });

const channels = mocksOf(await import("../service/channels"), "addChannel", "removeChannel", "renewSubscriptionsFor", "setChannelNotify");
const captions = mocksOf(await import("../service/caption-status"), "checkFollowedVideoCaptions");
const translation = mocksOf(await import("../service/translation"), "startTranslation", "uploadSubtitles", "retryTranslation", "restartTranslation", "continueTranslation");
const settings = mocksOf(await import("../service/ai-settings"), "saveSettings");
const saved = mocksOf(await import("../service/saved-videos"), "keepVideo", "removeSavedVideo");
const actions = await import("./actions");

const VIDEO = "dQw4w9WgXcQ";
const QUEUED = { status: "queued", done: 0, total: 8, error: null, translated: [] };

const subtitleFile = () => new File(["1\n00:00:01,000 --> 00:00:02,000\n안녕하세요\n"], "a.ko.srt", { type: "text/plain" });

beforeEach(() => {
  deferred.tasks = [];
  channels.addChannel.mockReset().mockResolvedValue({ title: "뉴진스" });
  channels.removeChannel.mockReset().mockResolvedValue({});
  channels.renewSubscriptionsFor.mockReset().mockResolvedValue("已檢查你追蹤的 1 個頻道的訂閱");
  channels.setChannelNotify.mockReset().mockResolvedValue(true);
  captions.checkFollowedVideoCaptions.mockReset().mockResolvedValue("no");
  for (const fn of Object.values(translation)) fn.mockReset().mockResolvedValue(undefined);
  settings.saveSettings.mockReset().mockResolvedValue(undefined);
  translation.startTranslation.mockResolvedValue({ ok: true });
  translation.continueTranslation.mockResolvedValue(QUEUED);
  saved.keepVideo.mockReset().mockResolvedValue("saved");
  saved.removeSavedVideo.mockReset().mockResolvedValue(true);
});

describe("YouTube 的 Server Action：寫入後用 updateTag 讓對應的 tag 失效", () => {
  it.each([
    // 追蹤改的是追蹤表 第一次有人追蹤時新增頻道 也從 RSS feed 補進影片
    ["addChannelAction", ["youtube:channels", "youtube:follows", "youtube:videos"], () => actions.addChannelAction({}, form({ channel: "@newjeans" }))],
    // 最後一位追蹤者取消時也會刪除頻道
    ["removeChannelAction", ["youtube:channels", "youtube:follows"], () => actions.removeChannelAction({}, form({ id: "2" }))],
    ["renewAction", ["youtube:channels"], () => actions.renewAction()],
    // 通知開關記在自己的追蹤上
    ["setChannelNotifyAction", ["youtube:follows"], () => actions.setChannelNotifyAction({}, form({ id: "2", enabled: "false" }))],
    ["recheckCaptionsAction", ["youtube:videos"], () => actions.recheckCaptionsAction({}, form({ videoId: VIDEO }))],
    ["saveSettingsAction", ["youtube:settings"], () => actions.saveSettingsAction({}, form({ provider: "anthropic" }))],
    // 按過翻譯的影片同時加進自己保留的影片
    ["startTranslationAction", ["youtube:saved_videos", "youtube:translation:dQw4w9WgXcQ", "youtube:translations"], () => actions.startTranslationAction(VIDEO)],
    [
      "uploadSubtitlesAction",
      ["youtube:saved_videos", "youtube:translation:dQw4w9WgXcQ", "youtube:translations"],
      () => actions.uploadSubtitlesAction({}, form({ videoId: VIDEO, file: subtitleFile() })),
    ],
    ["retryTranslationAction", ["youtube:saved_videos", "youtube:translation:dQw4w9WgXcQ", "youtube:translations"], () => actions.retryTranslationAction(VIDEO)],
    ["restartTranslationAction", ["youtube:saved_videos", "youtube:translation:dQw4w9WgXcQ", "youtube:translations"], () => actions.restartTranslationAction(VIDEO)],
    ["saveVideoAction", ["youtube:saved_videos"], () => actions.saveVideoAction({}, form({ videoId: VIDEO }))],
    ["removeSavedVideoAction", ["youtube:saved_videos"], () => actions.removeSavedVideoAction({}, form({ videoId: VIDEO }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    await run();

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經讓這次回應帶著重新算繪的頁面 再呼叫 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });

  it("用影片網址開始翻譯_tag 用解析出來的影片 id，跟觀看頁讀取時一致", async () => {
    await actions.startTranslationAction(`https://www.youtube.com/watch?v=${VIDEO}`);

    expect(updated()).toEqual(["youtube:saved_videos", "youtube:translation:dQw4w9WgXcQ", "youtube:translations"]);
  });

  it("按過翻譯但沒有加入保留的影片（清單滿了而且都是手動保留的）_只讓翻譯的 tag 失效", async () => {
    saved.keepVideo.mockResolvedValue("full");

    await actions.startTranslationAction(VIDEO);
    await actions.retryTranslationAction(VIDEO);

    expect([...new Set(updated())]).toEqual(["youtube:translation:dQw4w9WgXcQ", "youtube:translations"]);
  });

  it("加入頻道失敗_仍讓頻道列表失效：失敗前可能已經寫入一部分", async () => {
    channels.addChannel.mockRejectedValue(new Error("hub down"));
    captureErrorLog();

    expect((await actions.addChannelAction({}, form({ channel: "@newjeans" }))).error).toBeTruthy();
    expect(updated()).toEqual(["youtube:channels", "youtube:follows", "youtube:videos"]);
  });

  it.each([
    ["removeChannelAction 的 id 不正確", () => actions.removeChannelAction({}, form({ id: "-1" }))],
    ["setChannelNotifyAction 的 enabled 不正確", () => actions.setChannelNotifyAction({}, form({ id: "2", enabled: "on" }))],
    ["recheckCaptionsAction 的影片 id 不正確", () => actions.recheckCaptionsAction({}, form({ videoId: "bad" }))],
    ["saveSettingsAction 沒選供應商", () => actions.saveSettingsAction({}, form({ provider: "other" }))],
    ["startTranslationAction 的影片 id 不正確", () => actions.startTranslationAction("bad id")],
    ["uploadSubtitlesAction 沒選檔案", () => actions.uploadSubtitlesAction({}, form({ videoId: VIDEO }))],
    ["openVideoAction 只是轉址", () => expect(actions.openVideoAction({}, form({ url: VIDEO }))).rejects.toThrow("NEXT_REDIRECT:/youtube/watch/dQw4w9WgXcQ")],
    ["saveVideoAction 的影片 id 不正確", () => actions.saveVideoAction({}, form({ videoId: "bad" }))],
    ["removeSavedVideoAction 的影片 id 不正確", () => actions.removeSavedVideoAction({}, form({ videoId: "bad" }))],
    [
      "saveVideoAction 遇到清單滿了而且都是手動保留的",
      () => {
        saved.keepVideo.mockResolvedValue("full");
        return actions.saveVideoAction({}, form({ videoId: VIDEO }));
      },
    ],
  ])("%s_沒寫入就不失效", async (_name, run) => {
    await run();

    expect(updateTag).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("continueTranslationAction：每批寫回不能重繪頁面", () => {
  it("回應前不呼叫 updateTag（會重繪頁面、翻譯面板重新掛載）_回應送出後才用 expire: 0 失效", async () => {
    await expect(actions.continueTranslationAction(VIDEO, 0)).resolves.toEqual(QUEUED);

    expect(updateTag).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(deferred.tasks).toHaveLength(1);

    await deferred.tasks[0]();

    expect(vi.mocked(revalidateTag).mock.calls.sort()).toEqual([
      ["youtube:translation:dQw4w9WgXcQ", { expire: 0 }],
      ["youtube:translations", { expire: 0 }],
    ]);
  });

  it("翻譯途中出錯_一樣在回應後失效：出錯前可能已經寫回幾批", async () => {
    translation.continueTranslation.mockRejectedValue(new Error("db down"));
    captureErrorLog();

    expect(await actions.continueTranslationAction(VIDEO, 0)).toHaveProperty("actionError");
    await deferred.tasks[0]();

    expect(revalidateTag).toHaveBeenCalledWith("youtube:translations", { expire: 0 });
  });

  it("按了「用我的 API Key 繼續翻譯」後的呼叫（帶 join）成功_當場加進保留的影片，但照樣不重繪頁面：回應送出後才連保留清單一起失效", async () => {
    await actions.continueTranslationAction(VIDEO, 0, true);

    expect(saved.keepVideo).toHaveBeenCalledOnce();
    expect(updateTag).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    await deferred.tasks[0]();
    expect(expiredTags()).toEqual(["youtube:saved_videos", "youtube:translation:dQw4w9WgXcQ", "youtube:translations"]);
  });

  it("帶 join 但續翻失敗、或清單滿了而且都是手動保留的_沒有加入，只讓翻譯的 tag 失效", async () => {
    captureErrorLog();
    translation.continueTranslation.mockRejectedValueOnce(new Error("db down"));
    saved.keepVideo.mockResolvedValue("full");

    await actions.continueTranslationAction(VIDEO, 0, true);
    await actions.continueTranslationAction(VIDEO, 0, true);
    for (const task of deferred.tasks) await task();

    expect(expiredTags()).toEqual(["youtube:translation:dQw4w9WgXcQ", "youtube:translations"]);
  });

  it("影片 id 不正確_不排失效", async () => {
    translation.continueTranslation.mockRejectedValue(new Error("影片 ID 格式不正確"));
    captureErrorLog();

    await actions.continueTranslationAction("bad id", 0);

    expect(deferred.tasks).toEqual([]);
  });
});
