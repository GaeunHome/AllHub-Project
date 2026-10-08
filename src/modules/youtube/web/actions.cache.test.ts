import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureErrorLog, form, mocksOf, updated } from "@/dev/test-helpers";

const deferred = vi.hoisted(() => ({ tasks: [] as (() => unknown)[] }));

vi.mock("next/server", () => ({ after: (task: () => unknown) => deferred.tasks.push(task) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/channels", { spy: true });
vi.mock("../service/caption-status", { spy: true });
vi.mock("../service/translation", { spy: true });

const channels = mocksOf(await import("../service/channels"), "addChannel", "removeChannel", "renewSubscriptions", "setChannelNotify");
const captions = mocksOf(await import("../service/caption-status"), "checkChineseCaptions");
const translation = mocksOf(
  await import("../service/translation"),
  "saveSettings",
  "startTranslation",
  "uploadSubtitles",
  "retryTranslation",
  "restartTranslation",
  "continueTranslation",
);
const actions = await import("./actions");

const VIDEO = "dQw4w9WgXcQ";
const QUEUED = { status: "queued", done: 0, total: 8, error: null, translated: [] };

const subtitleFile = () => new File(["1\n00:00:01,000 --> 00:00:02,000\n안녕하세요\n"], "a.ko.srt", { type: "text/plain" });

beforeEach(() => {
  deferred.tasks = [];
  channels.addChannel.mockReset().mockResolvedValue({ title: "뉴진스" });
  channels.removeChannel.mockReset().mockResolvedValue({});
  channels.renewSubscriptions.mockReset().mockResolvedValue("1 個頻道，續訂 1 個");
  channels.setChannelNotify.mockReset().mockResolvedValue(true);
  captions.checkChineseCaptions.mockReset().mockResolvedValue("no");
  for (const fn of Object.values(translation)) fn.mockReset().mockResolvedValue(undefined);
  translation.startTranslation.mockResolvedValue({ ok: true });
  translation.continueTranslation.mockResolvedValue(QUEUED);
});

describe("YouTube 的 Server Action：寫入後用 updateTag 讓對應的 tag 失效", () => {
  it.each([
    ["addChannelAction", ["youtube:channels"], () => actions.addChannelAction({}, form({ channel: "@newjeans" }))],
    ["removeChannelAction", ["youtube:channels"], () => actions.removeChannelAction({}, form({ id: "2" }))],
    ["renewAction", ["youtube:channels"], () => actions.renewAction()],
    ["setChannelNotifyAction", ["youtube:channels"], () => actions.setChannelNotifyAction({}, form({ id: "2", enabled: "false" }))],
    ["recheckCaptionsAction", ["youtube:videos"], () => actions.recheckCaptionsAction({}, form({ videoId: VIDEO }))],
    ["saveSettingsAction", ["youtube:settings"], () => actions.saveSettingsAction({}, form({ provider: "anthropic" }))],
    ["startTranslationAction", ["youtube:translation:dQw4w9WgXcQ", "youtube:translations"], () => actions.startTranslationAction(VIDEO)],
    [
      "uploadSubtitlesAction",
      ["youtube:translation:dQw4w9WgXcQ", "youtube:translations"],
      () => actions.uploadSubtitlesAction({}, form({ videoId: VIDEO, file: subtitleFile() })),
    ],
    ["retryTranslationAction", ["youtube:translation:dQw4w9WgXcQ", "youtube:translations"], () => actions.retryTranslationAction(VIDEO)],
    ["restartTranslationAction", ["youtube:translation:dQw4w9WgXcQ", "youtube:translations"], () => actions.restartTranslationAction(VIDEO)],
  ] as const)("%s_%j", async (_name, tags, run) => {
    await run();

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經會讓這次回應帶著重新算繪的頁面，再呼叫 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });

  it("用影片網址開始翻譯_tag 用解析出來的影片 id，跟觀看頁讀取時一致", async () => {
    await actions.startTranslationAction(`https://www.youtube.com/watch?v=${VIDEO}`);

    expect(updated()).toEqual(["youtube:translation:dQw4w9WgXcQ", "youtube:translations"]);
  });

  it("加入頻道失敗_仍讓頻道列表失效：失敗前可能已經寫入一部分", async () => {
    channels.addChannel.mockRejectedValue(new Error("hub down"));
    captureErrorLog();

    expect((await actions.addChannelAction({}, form({ channel: "@newjeans" }))).error).toBeTruthy();
    expect(updated()).toEqual(["youtube:channels"]);
  });

  it.each([
    ["removeChannelAction 的 id 不正確", () => actions.removeChannelAction({}, form({ id: "-1" }))],
    ["setChannelNotifyAction 的 enabled 不正確", () => actions.setChannelNotifyAction({}, form({ id: "2", enabled: "on" }))],
    ["recheckCaptionsAction 的影片 id 不正確", () => actions.recheckCaptionsAction({}, form({ videoId: "bad" }))],
    ["saveSettingsAction 沒選供應商", () => actions.saveSettingsAction({}, form({ provider: "other" }))],
    ["startTranslationAction 的影片 id 不正確", () => actions.startTranslationAction("bad id")],
    ["uploadSubtitlesAction 沒選檔案", () => actions.uploadSubtitlesAction({}, form({ videoId: VIDEO }))],
    ["openVideoAction 只是轉址", () => actions.openVideoAction({}, form({ url: VIDEO }))],
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

  it("影片 id 不正確_不排失效", async () => {
    translation.continueTranslation.mockRejectedValue(new Error("影片 ID 格式不正確"));
    captureErrorLog();

    await actions.continueTranslationAction("bad id", 0);

    expect(deferred.tasks).toEqual([]);
  });
});
