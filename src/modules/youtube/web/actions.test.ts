import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, mocksOf } from "@/dev/test-helpers";

vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/channels", { spy: true });
vi.mock("../service/translation", { spy: true });
vi.mock("../service/ai-settings", { spy: true });

vi.mock("../service/caption-status", { spy: true });
vi.mock("../service/saved-videos", { spy: true });

const channels = mocksOf(await import("../service/channels"), "addChannel", "removeChannel", "setChannelNotify", "renewSubscriptionsFor");
const captions = mocksOf(await import("../service/caption-status"), "checkFollowedVideoCaptions");
const translation = mocksOf(await import("../service/translation"), "retryTranslation", "restartTranslation", "uploadSubtitles", "startTranslation", "continueTranslation");
const settings = mocksOf(await import("../service/ai-settings"), "saveSettings");
const { TranslationUserError } = await import("../service/errors");
const saved = mocksOf(await import("../service/saved-videos"), "keepVideo", "removeSavedVideo");
const actions = await import("./actions");
const { addChannelAction, restartTranslationAction, retryTranslationAction, uploadSubtitlesAction } = actions;

const VIDEO = "dQw4w9WgXcQ";

beforeEach(() => {
  requireSession.mockReset();
  channels.addChannel.mockReset().mockResolvedValue({ title: "뉴진스" });
  channels.removeChannel.mockReset().mockResolvedValue({});
  channels.setChannelNotify.mockReset().mockResolvedValue(true);
  channels.renewSubscriptionsFor.mockReset().mockResolvedValue("已檢查你追蹤的 1 個頻道的訂閱");
  captions.checkFollowedVideoCaptions.mockReset().mockResolvedValue("no");
  for (const fn of Object.values(translation)) fn.mockReset().mockResolvedValue(undefined);
  settings.saveSettings.mockReset().mockResolvedValue(undefined);
  translation.startTranslation.mockResolvedValue({ ok: true });
  translation.continueTranslation.mockResolvedValue({ status: "queued", done: 0, total: 1, error: null, translated: [null] });
  saved.keepVideo.mockReset().mockResolvedValue("saved");
  saved.removeSavedVideo.mockReset().mockResolvedValue(true);
});

describe("非預期錯誤", () => {
  it("回傳摘要；log 只記錯誤種類，不記 message（可能含 SQL 與參數）", async () => {
    const log = captureErrorLog();
    const error = new Error('Failed query: insert into "youtube_channels" params: secret-detail');
    error.name = "DrizzleQueryError";
    channels.addChannel.mockRejectedValue(error);
    const state = await addChannelAction({}, form({ channel: "@someone" }));

    expect(state).toEqual({ error: "加入頻道失敗（詳見伺服器 log）" });
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain("DrizzleQueryError");
  });
});

describe("重試與重新翻譯", () => {
  it("失敗 → 回傳錯誤狀態，不丟例外（專案沒有 error.tsx，丟出去整頁都會壞）", async () => {
    captureErrorLog();
    translation.retryTranslation.mockRejectedValue(new Error("db down"));
    translation.restartTranslation.mockRejectedValue(new Error("db down"));

    await expect(retryTranslationAction(VIDEO)).resolves.toEqual({ error: "重試失敗（詳見伺服器 log）" });
    await expect(restartTranslationAction(VIDEO)).resolves.toEqual({ error: "重新翻譯失敗（詳見伺服器 log）" });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("uploadSubtitlesAction：編碼", () => {
  const header = "1\n00:00:01,000 --> 00:00:02,000\n";
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  const upload = (bytes: Uint8Array<ArrayBuffer>) => uploadSubtitlesAction({}, form({ videoId: VIDEO, file: new File([bytes], "video.ko.srt") }));

  it("UTF-8 → 原文交給翻譯", async () => {
    const state = await upload(new TextEncoder().encode(`${header}안녕하세요\n`));
    expect(state).toEqual({ message: "已上傳，開始翻譯" });
    expect(translation.uploadSubtitles).toHaveBeenCalledWith(TEST_SESSION, VIDEO, `${header}안녕하세요\n`);
  });

  it("CP949（韓文 Windows 的預設編碼）→ 轉成正確的韓文再交給翻譯，不送亂碼", async () => {
    // 안녕 這兩個字的 CP949 編碼
    await upload(Uint8Array.from([...ascii(header), 0xbe, 0xc8, 0xb3, 0xe7, 0x0a]));
    expect(translation.uploadSubtitles).toHaveBeenCalledWith(TEST_SESSION, VIDEO, `${header}안녕\n`);
  });

  it("UTF-8 與 CP949 都不是 → 提示轉成 UTF-8，不交給翻譯", async () => {
    const state = await upload(Uint8Array.from([0xff, 0xfe, 0x31, 0x00, 0x0a, 0x00]));
    expect(state.error).toContain("UTF-8");
    expect(translation.uploadSubtitles).not.toHaveBeenCalled();
  });
});

describe("儲存翻譯設定", () => {
  it("專有名詞表超過上限_顯示 service 的說明，並把剛送出的專有名詞表帶回表單（送出後表單會重設，打的內容才不會不見）", async () => {
    settings.saveSettings.mockRejectedValue(new TranslationUserError("專有名詞表最多 200 筆（目前 201 筆），請刪掉用不到的"));

    expect(await actions.saveSettingsAction({}, form({ provider: "anthropic", glossary: "민지=珉池\n하니=Hanni" }))).toEqual({ error: "專有名詞表最多 200 筆（目前 201 筆），請刪掉用不到的", glossaryText: "민지=珉池\n하니=Hanni" });
  });

  it("儲存成功_不帶回專有名詞表（表單用存好的設定）", async () => {
    expect(await actions.saveSettingsAction({}, form({ provider: "anthropic", glossary: "민지=珉池" }))).toEqual({ message: "已儲存" });
  });
});

describe("擁有權：一律用登入者呼叫 service（表單送來的 id 只決定操作哪一筆）", () => {
  it.each([
    ["addChannelAction", () => actions.addChannelAction({}, form({ channel: "@newjeans" })), () => channels.addChannel],
    ["removeChannelAction", () => actions.removeChannelAction({}, form({ id: "2" })), () => channels.removeChannel],
    ["setChannelNotifyAction", () => actions.setChannelNotifyAction({}, form({ id: "2", enabled: "false" })), () => channels.setChannelNotify],
    // 冷卻時間依登入者計算 回應也只說他自己追蹤的頻道
    ["renewAction", () => actions.renewAction(), () => channels.renewSubscriptionsFor],
    ["recheckCaptionsAction", () => actions.recheckCaptionsAction({}, form({ videoId: VIDEO })), () => captions.checkFollowedVideoCaptions],
    ["saveSettingsAction", () => actions.saveSettingsAction({}, form({ provider: "anthropic" })), () => settings.saveSettings],
    ["startTranslationAction", () => actions.startTranslationAction(VIDEO), () => translation.startTranslation],
    ["continueTranslationAction", () => actions.continueTranslationAction(VIDEO, 0), () => translation.continueTranslation],
    ["retryTranslationAction", () => actions.retryTranslationAction(VIDEO), () => translation.retryTranslation],
    // 保留的影片每人一份 送來的 id 只決定是哪一支 改的都是登入者自己的清單
    ["saveVideoAction", () => actions.saveVideoAction({}, form({ videoId: VIDEO })), () => saved.keepVideo],
    ["removeSavedVideoAction", () => actions.removeSavedVideoAction({}, form({ videoId: VIDEO })), () => saved.removeSavedVideo],
  ] as const)("%s_帶的是登入者（bob）的 id", async (_name, run, service) => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await run();

    expect(service().mock.calls[0][0]).toBe(OTHER_SESSION.id);
  });

  it("restartTranslationAction_帶的是登入者（bob）與他的角色：只有發起人或站長能重新翻譯", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await actions.restartTranslationAction(VIDEO);

    expect(translation.restartTranslation.mock.calls[0][0]).toEqual(OTHER_SESSION);
  });

  it("uploadSubtitlesAction_帶的是登入者（bob）與他的角色：只有發起人或站長能換字幕", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    await actions.uploadSubtitlesAction({}, form({ videoId: VIDEO, file: new File([new TextEncoder().encode("1\n00:00:01,000 --> 00:00:02,000\n안녕\n")], "a.srt") }));

    expect(translation.uploadSubtitles.mock.calls[0][0]).toEqual(OTHER_SESSION);
  });

  it("不是發起人也不是站長時重新翻譯_顯示 service 的說明", async () => {
    translation.restartTranslation.mockRejectedValue(new TranslationUserError("只有發起翻譯的人或站長可以重新翻譯"));

    expect(await actions.restartTranslationAction(VIDEO)).toEqual({ error: "只有發起翻譯的人或站長可以重新翻譯" });
  });
});
