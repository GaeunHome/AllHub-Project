import { beforeEach, describe, expect, it, vi } from "vitest";
import { INVALID_FORM_MESSAGE } from "@/core/form";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, loggedText, mocksOf } from "@/dev/test-helpers";

const deferred = vi.hoisted(() => ({ tasks: [] as (() => unknown)[] }));

vi.mock("next/server", () => ({ after: (task: () => unknown) => deferred.tasks.push(task) }));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/saved-videos", { spy: true });
vi.mock("../service/translation", { spy: true });
vi.mock("../service/cached", { spy: true });

const saved = mocksOf(await import("../service/saved-videos"), "keepVideo", "removeSavedVideo");
const translation = mocksOf(await import("../service/translation"), "startTranslation", "uploadSubtitles", "retryTranslation", "restartTranslation", "continueTranslation");
const { cachedVideoInfo } = mocksOf(await import("../service/cached"), "cachedVideoInfo");
const { ApiKeySetupError, TranslationUserError } = await import("../service/errors");
const actions = await import("./actions");

const VIDEO = "dQw4w9WgXcQ";
const QUEUED = { status: "queued", done: 0, total: 8, error: null, translated: [] };
const subtitleFile = () => new File(["1\n00:00:01,000 --> 00:00:02,000\n안녕하세요\n"], "a.ko.srt", { type: "text/plain" });
type KeepCall = [string, string, { pinned: boolean; lookup?: () => Promise<unknown> }];
const keepCall = (index = 0) => saved.keepVideo.mock.calls[index] as KeepCall;

beforeEach(() => {
  deferred.tasks = [];
  requireSession.mockReset();
  saved.keepVideo.mockReset().mockResolvedValue("saved");
  saved.removeSavedVideo.mockReset().mockResolvedValue(true);
  for (const fn of Object.values(translation)) fn.mockReset().mockResolvedValue(undefined);
  translation.startTranslation.mockResolvedValue({ ok: true });
  translation.continueTranslation.mockResolvedValue(QUEUED);
  cachedVideoInfo.mockReset().mockResolvedValue({ title: "oEmbed 標題", channelName: "oEmbed 頻道", channelUrl: null });
});

describe("觀看頁的「保留」", () => {
  it("用登入者（bob）的 id 手動保留；資料庫沒有的標題與頻道名稱沿用觀看頁讀過的 oEmbed 快取", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    expect(await actions.saveVideoAction({}, form({ videoId: VIDEO }))).toEqual({});

    const [userId, videoId, options] = keepCall();
    expect([userId, videoId, options.pinned]).toEqual([OTHER_SESSION.id, VIDEO, true]);
    expect(await options.lookup?.()).toEqual({ title: "oEmbed 標題", channelTitle: "oEmbed 頻道" });
    expect(cachedVideoInfo).toHaveBeenCalledWith(VIDEO);
  });

  it("oEmbed 也讀不到_快照給 null（照樣保留）", async () => {
    cachedVideoInfo.mockResolvedValue(null);

    await actions.saveVideoAction({}, form({ videoId: VIDEO }));

    expect(await keepCall()[2].lookup?.()).toBeNull();
  });

  it("15 部都是手動保留的_回傳「已滿」的說明", async () => {
    saved.keepVideo.mockResolvedValue("full");

    expect(await actions.saveVideoAction({}, form({ videoId: VIDEO }))).toEqual({ error: "保留的影片已滿 15 部，請先移除一部" });
  });

  it("移除_用登入者（bob）的 id；已經不在清單裡（例如在別的分頁移除了）也當作成功", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    saved.removeSavedVideo.mockResolvedValue(false);

    expect(await actions.removeSavedVideoAction({}, form({ videoId: VIDEO }))).toEqual({});

    expect(saved.removeSavedVideo).toHaveBeenCalledWith(OTHER_SESSION.id, VIDEO);
  });

  it.each([
    ["影片網址", `https://www.youtube.com/watch?v=${VIDEO}`],
    ["不是 11 碼", "abc"],
    ["前後有空白", ` ${VIDEO} `],
    ["沒有給", ""],
  ])("影片 id 只收 11 碼（%s）_不呼叫 service", async (_name, videoId) => {
    expect(await actions.saveVideoAction({}, form({ videoId }))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(await actions.removeSavedVideoAction({}, form({ videoId }))).toEqual({ error: INVALID_FORM_MESSAGE });

    expect(saved.keepVideo).not.toHaveBeenCalled();
    expect(saved.removeSavedVideo).not.toHaveBeenCalled();
  });

  it("寫入失敗_回傳摘要，log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    saved.keepVideo.mockRejectedValue(new Error("secret-detail"));
    saved.removeSavedVideo.mockRejectedValue(new Error("secret-detail"));

    expect(await actions.saveVideoAction({}, form({ videoId: VIDEO }))).toEqual({ error: "保留影片失敗（詳見伺服器 log）" });
    expect(await actions.removeSavedVideoAction({}, form({ videoId: VIDEO }))).toEqual({ error: "移除保留的影片失敗（詳見伺服器 log）" });
    expect(loggedText(log)).not.toContain("secret-detail");
  });
});

describe("按過翻譯的影片自動加進保留的影片", () => {
  it.each([
    ["開始翻譯", () => actions.startTranslationAction(VIDEO)],
    ["上傳字幕", () => actions.uploadSubtitlesAction({}, form({ videoId: VIDEO, file: subtitleFile() }))],
    ["重試", () => actions.retryTranslationAction(VIDEO)],
    ["重新翻譯", () => actions.restartTranslationAction(VIDEO)],
  ])("%s 成功_用登入者（bob）的 id 自動加入（不是手動保留），標題沿用 oEmbed 的快取", async (_name, run) => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await run();

    expect(saved.keepVideo).toHaveBeenCalledOnce();
    const [userId, videoId, options] = keepCall();
    expect([userId, videoId, options.pinned]).toEqual([OTHER_SESSION.id, VIDEO, false]);
    expect(await options.lookup?.()).toEqual({ title: "oEmbed 標題", channelTitle: "oEmbed 頻道" });
  });

  it("用影片網址開始翻譯_存的是解析出來的 11 碼 id", async () => {
    await actions.startTranslationAction(`https://youtu.be/${VIDEO}`);

    expect(keepCall()[1]).toBe(VIDEO);
  });

  it("翻譯沒有開始（抓不到字幕、沒有 API Key、不是發起人、檔案不對）_不加入", async () => {
    translation.startTranslation.mockResolvedValue({ ok: false, message: "這支影片沒有韓文字幕", canUpload: true });
    translation.retryTranslation.mockRejectedValue(new ApiKeySetupError("還沒設定 Claude 的 API Key，請先到「翻譯設定」填入"));
    translation.restartTranslation.mockRejectedValue(new TranslationUserError("只有發起翻譯的人或站長可以重新翻譯"));
    translation.uploadSubtitles.mockRejectedValue(new TranslationUserError("看不懂這個字幕檔"));

    await actions.startTranslationAction(VIDEO);
    await actions.retryTranslationAction(VIDEO);
    await actions.restartTranslationAction(VIDEO);
    await actions.uploadSubtitlesAction({}, form({ videoId: VIDEO, file: subtitleFile() }));

    expect(saved.keepVideo).not.toHaveBeenCalled();
  });

  it("加入失敗、或清單滿了而且都是手動保留的_翻譯照常、不顯示錯誤；log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    saved.keepVideo.mockRejectedValueOnce(new Error("secret-detail")).mockResolvedValueOnce("full");

    expect(await actions.startTranslationAction(VIDEO)).toEqual({ ok: true });
    expect(await actions.retryTranslationAction(VIDEO)).toEqual({});
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("續翻：按了「用我的 API Key 繼續翻譯」後送出的呼叫（帶 join）成功_當場加入並在回應裡帶 saved（頁面不重繪，觀看頁靠它把「保留」改成「已保留」），用登入者（bob）的 id、標成自動，標題沿用 oEmbed 的快取", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await expect(actions.continueTranslationAction(VIDEO, 0, true)).resolves.toEqual({ ...QUEUED, saved: true });

    expect(saved.keepVideo).toHaveBeenCalledOnce();
    const [userId, videoId, options] = keepCall();
    expect([userId, videoId, options.pinned]).toEqual([OTHER_SESSION.id, VIDEO, false]);
    expect(await options.lookup?.()).toEqual({ title: "oEmbed 標題", channelTitle: "oEmbed 頻道" });
  });

  it("續翻帶 join、別人正在翻（這次沒做事）_也加入：跟別人同時在翻時照樣算按過翻譯", async () => {
    translation.continueTranslation.mockResolvedValue({ ...QUEUED, busy: true });

    expect(await actions.continueTranslationAction(VIDEO, 0, true)).toEqual({ ...QUEUED, busy: true, saved: true });
    expect(saved.keepVideo).toHaveBeenCalledOnce();
  });

  it.each([
    ["清單滿了而且都是手動保留的（自動加入略過）", () => saved.keepVideo.mockResolvedValue("full")],
    ["寫入保留的影片失敗", () => saved.keepVideo.mockRejectedValue(new Error("secret-detail"))],
  ])("續翻帶 join 成功，但%s_回應不帶 saved（觀看頁的按鈕維持「保留」），翻譯照常", async (_name, arrange) => {
    const log = captureErrorLog();
    arrange();

    expect(await actions.continueTranslationAction(VIDEO, 0, true)).toEqual(QUEUED);
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it.each([
    ["沒有 API Key", new ApiKeySetupError("還沒設定 Claude 的 API Key，請先到「翻譯設定」填入")],
    ["自己的金鑰額度用完", new TranslationUserError("AI 額度用完了，請稍後按「繼續翻譯」")],
    ["還沒開始翻譯", new TranslationUserError("這支影片還沒開始翻譯")],
  ])("續翻帶 join 但失敗（%s）_不加入：跟開始、重試一樣成功後才加入", async (_name, error) => {
    translation.continueTranslation.mockRejectedValue(error);

    expect(await actions.continueTranslationAction(VIDEO, 0, true)).toHaveProperty("actionError");
    await deferred.tasks[0]();

    expect(saved.keepVideo).not.toHaveBeenCalled();
  });

  it("續翻沒帶 join（迴圈裡的下一批、自己發起的翻譯打開觀看頁自動接著翻）_不寫入保留的影片，回應也不帶 saved", async () => {
    expect(await actions.continueTranslationAction(VIDEO, 0)).toEqual(QUEUED);
    expect(await actions.continueTranslationAction(VIDEO, 0, false)).toEqual(QUEUED);
    for (const task of deferred.tasks) await task();

    expect(saved.keepVideo).not.toHaveBeenCalled();
  });

  it("join 只認 true（Server Action 可以被直接 POST）_其他值當成沒帶", async () => {
    for (const join of ["true", 1, {}]) await actions.continueTranslationAction(VIDEO, 0, join as unknown as boolean);
    for (const task of deferred.tasks) await task();

    expect(saved.keepVideo).not.toHaveBeenCalled();
  });

  it("join 只影響保留的影片：續翻本身照原本的規則（登入者自己的 API Key、翻譯鎖），service 拿到的參數跟沒帶時一樣", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await actions.continueTranslationAction(VIDEO, 5_000, true);

    expect(translation.continueTranslation).toHaveBeenCalledWith(OTHER_SESSION.id, VIDEO, { positionMs: 5_000 });
  });
});
