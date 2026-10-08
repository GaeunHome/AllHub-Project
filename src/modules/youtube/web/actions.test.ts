import { refresh, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureErrorLog, mocksOf } from "@/dev/test-helpers";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/channels", { spy: true });
vi.mock("../service/translation", { spy: true });

const channels = mocksOf(await import("../service/channels"), "addChannel");
const translation = mocksOf(await import("../service/translation"), "retryTranslation", "restartTranslation", "uploadSubtitles");
const { addChannelAction, restartTranslationAction, retryTranslationAction, uploadSubtitlesAction } = await import("./actions");

const VIDEO = "dQw4w9WgXcQ";

beforeEach(() => {
  channels.addChannel.mockReset();
  for (const fn of Object.values(translation)) fn.mockReset().mockResolvedValue(undefined);
});

describe("非預期錯誤", () => {
  it("回傳摘要；log 只記錯誤種類，不記 message（可能含 SQL 與參數）", async () => {
    const log = captureErrorLog();
    const error = new Error('Failed query: insert into "youtube_channels" params: secret-detail');
    error.name = "DrizzleQueryError";
    channels.addChannel.mockRejectedValue(error);
    const form = new FormData();
    form.set("channel", "@someone");

    const state = await addChannelAction({}, form);

    expect(state).toEqual({ error: "加入頻道失敗（詳見伺服器 log）" });
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain("DrizzleQueryError");
  });
});

describe("重試與重新翻譯", () => {
  it("成功 → 刷新畫面、沒有錯誤", async () => {
    await expect(retryTranslationAction(VIDEO)).resolves.toEqual({});
    await expect(restartTranslationAction(VIDEO)).resolves.toEqual({});
    expect(translation.retryTranslation).toHaveBeenCalledWith(VIDEO);
    expect(translation.restartTranslation).toHaveBeenCalledWith(VIDEO);
    expect(vi.mocked(updateTag).mock.calls.filter(([tag]) => tag === `youtube:translation:${VIDEO}`)).toHaveLength(2);
    expect(refresh).not.toHaveBeenCalled();
  });

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

  function upload(bytes: Uint8Array<ArrayBuffer>) {
    const form = new FormData();
    form.set("videoId", VIDEO);
    form.set("file", new File([bytes], "video.ko.srt"));
    return uploadSubtitlesAction({}, form);
  }

  it("UTF-8 → 原文交給翻譯", async () => {
    const state = await upload(new TextEncoder().encode(`${header}안녕하세요\n`));
    expect(state).toEqual({ message: "已上傳，開始翻譯" });
    expect(translation.uploadSubtitles).toHaveBeenCalledWith(VIDEO, `${header}안녕하세요\n`);
  });

  it("CP949（韓文 Windows 的預設編碼）→ 轉成正確的韓文再交給翻譯，不送亂碼", async () => {
    // 「안녕」的 CP949 編碼
    await upload(Uint8Array.from([...ascii(header), 0xbe, 0xc8, 0xb3, 0xe7, 0x0a]));
    expect(translation.uploadSubtitles).toHaveBeenCalledWith(VIDEO, `${header}안녕\n`);
  });

  it("UTF-8 與 CP949 都不是 → 提示轉成 UTF-8，不交給翻譯", async () => {
    const state = await upload(Uint8Array.from([0xff, 0xfe, 0x31, 0x00, 0x0a, 0x00]));
    expect(state.error).toContain("UTF-8");
    expect(translation.uploadSubtitles).not.toHaveBeenCalled();
  });
});
