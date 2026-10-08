import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { mocksOf } from "@/dev/test-helpers";
import { youtubeSettings, youtubeTranslations, youtubeVideos } from "../data/schema";

stubCoreEnv();

vi.mock("../lib/subtitles", { spy: true });
vi.mock("../lib/api", { spy: true });

const { fetchKoreanCaptions, translateBatch } = mocksOf(await import("../lib/subtitles"), "fetchKoreanCaptions", "translateBatch");
const { fetchVideoTitle } = mocksOf(await import("../lib/api"), "fetchVideoTitle");
const { AiError, DEFAULT_MODELS } = await import("../lib/subtitles");
const translation = await import("./translation");
const {
  saveSettings,
  getSettingsView,
  startTranslation,
  uploadSubtitles,
  continueTranslation,
  retryTranslation,
  restartTranslation,
  missingApiKeyMessage,
  TranslationUserError,
  ApiKeySetupError,
} = translation;

const VIDEO = "dQw4w9WgXcQ";
type BatchArgs = { cues: { text: string }[]; batch: { start: number; end: number }; beforeCall?: () => Promise<void> };
type Progress = Awaited<ReturnType<typeof continueTranslation>>;
const cue = (i: number) => ({ start: i * 1000, end: i * 1000 + 900, text: `문장 ${i}` });
const cues = (n: number) => Array.from({ length: n }, (_, i) => cue(i));

let testDb: TestDb;
const getDb = setupTestDb((d) => (testDb = d));

/** 每批翻譯會讓假時鐘前進 batchMs */
let clock = 0;
let batchMs = 1000;
const now = () => clock;

beforeEach(async () => {
  clock = 1_000_000;
  batchMs = 1000;
  fetchKoreanCaptions.mockReset().mockResolvedValue({ ok: true, kind: "manual", language: "ko", cues: cues(130) });
  fetchVideoTitle.mockReset().mockResolvedValue("影片標題");
  translateBatch.mockReset().mockImplementation(async ({ cues: all, batch }: { cues: { text: string }[]; batch: { start: number; end: number } }) => {
    clock += batchMs;
    return all.slice(batch.start, batch.end).map((c) => `中 ${c.text}`);
  });
  await saveSettings({ provider: "anthropic", keys: { anthropic: "sk-ant-secret-1234" }, clear: [], models: {}, glossaryText: "지수=Jisoo" });
});

describe("設定", () => {
  it("金鑰加密儲存_畫面只看到末4碼_留空不變更_可清除", async () => {
    const [row] = await testDb.select().from(youtubeSettings);
    expect(row.anthropicKey).not.toContain("sk-ant");
    expect(row.anthropicKeyHint).toBe("1234");

    await saveSettings({ provider: "openai", keys: { anthropic: "", openai: "sk-openai-9876" }, clear: [], models: { openai: " gpt-x " }, glossaryText: "" });
    let view = await getSettingsView();
    expect(view.provider).toBe("openai");
    expect(view.keys).toEqual({ anthropic: "1234", openai: "9876", gemini: null });
    expect(view.customModels.openai).toBe("gpt-x");
    expect(view.glossaryText).toBe("");
    expect(JSON.stringify(view)).not.toContain("sk-");

    await saveSettings({ provider: "openai", keys: {}, clear: ["anthropic"], models: {}, glossaryText: "" });
    view = await getSettingsView();
    expect(view.keys.anthropic).toBeNull();
  });

  it("沒填模型時用預設值", async () => {
    const view = await getSettingsView();
    expect(view.customModels.anthropic).toBe("");
    expect(view.defaultModels.anthropic).toBe("claude-haiku-4-5");
    // 「實際會用的模型」由 customModels 與 defaultModels 合併而來，不再另外放一份
    expect(view).not.toHaveProperty("models");
  });

  it("觀看頁的金鑰提示：目前的供應商有金鑰回 null，沒有就回要去設定的提示", async () => {
    expect(await missingApiKeyMessage()).toBeNull();

    await saveSettings({ provider: "gemini", keys: {}, clear: [], models: {}, glossaryText: "" });
    expect(await missingApiKeyMessage()).toContain("還沒設定 Gemini 的 API Key");
  });

  it("模型留空存 null；表單拿到原始自訂值（沒填是空字串）與程式預設值當提示", async () => {
    await saveSettings({ provider: "anthropic", keys: {}, clear: [], models: { anthropic: "", openai: "  ", gemini: "gemini-custom" }, glossaryText: "" });

    const [row] = await testDb.select().from(youtubeSettings);
    expect(row).toMatchObject({ anthropicModel: null, openaiModel: null, geminiModel: "gemini-custom" });
    const view = await getSettingsView();
    expect(view.customModels).toEqual({ anthropic: "", openai: "", gemini: "gemini-custom" });
    expect(view.defaultModels).toEqual(DEFAULT_MODELS);
  });
});

describe("startTranslation", () => {
  it("抓到韓文字幕_建立排隊中的翻譯_切好批次_存標題", async () => {
    const result = await startTranslation(VIDEO);

    expect(result).toEqual({ ok: true });
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ videoId: VIDEO, status: "queued", sourceKind: "manual", title: "影片標題", nextBatch: 0 });
    expect(row.sourceCues).toHaveLength(130);
    expect(row.translated).toEqual(Array(130).fill(null));
    expect(row.batches).toEqual([
      { start: 0, end: 30 },
      { start: 30, end: 60 },
      { start: 60, end: 90 },
      { start: 90, end: 120 },
      { start: 120, end: 130 },
    ]);
  });

  it("追蹤影片已有標題時不另外查", async () => {
    await getDb().insert(youtubeVideos).values({ videoId: VIDEO, channelId: "UC" + "a".repeat(22), title: "已知標題" });
    await startTranslation(VIDEO);
    expect(fetchVideoTitle).not.toHaveBeenCalled();
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row.title).toBe("已知標題");
  });

  it("抓不到字幕_回原因並提示可上傳_不建立紀錄", async () => {
    fetchKoreanCaptions.mockResolvedValue({ ok: false, reason: "blocked", message: "YouTube 要求驗證" });
    expect(await startTranslation(VIDEO)).toEqual({ ok: false, message: "YouTube 要求驗證", canUpload: true });
    expect(await testDb.select().from(youtubeTranslations)).toHaveLength(0);
  });

  it("沒有設定目前供應商的金鑰_先擋下_不抓字幕", async () => {
    await saveSettings({ provider: "gemini", keys: {}, clear: [], models: {}, glossaryText: "" });
    await expect(startTranslation(VIDEO)).rejects.toBeInstanceOf(TranslationUserError);
    expect(fetchKoreanCaptions).not.toHaveBeenCalled();
  });

  it("金鑰沒設定或解不開_丟要到設定頁處理的錯誤（畫面會附上設定頁連結）", async () => {
    await saveSettings({ provider: "gemini", keys: {}, clear: [], models: {}, glossaryText: "" });
    await expect(startTranslation(VIDEO)).rejects.toBeInstanceOf(ApiKeySetupError);

    await getDb().update(youtubeSettings).set({ provider: "anthropic", anthropicKey: "v1.00000000.AAAA" });
    await expect(startTranslation(VIDEO)).rejects.toBeInstanceOf(ApiKeySetupError);
  });

  it("已經有翻譯紀錄_直接沿用_不重抓", async () => {
    await startTranslation(VIDEO);
    await startTranslation(VIDEO);
    expect(fetchKoreanCaptions).toHaveBeenCalledOnce();
  });

  it("影片 id 格式錯誤_使用者錯誤", async () => {
    await expect(startTranslation("bad")).rejects.toBeInstanceOf(TranslationUserError);
  });
});

describe("uploadSubtitles", () => {
  const srt = "1\n00:00:01,000 --> 00:00:02,000\n안녕\n\n2\n00:00:03,000 --> 00:00:04,000\n하세요\n";

  it("上傳字幕檔_建立來源為 upload 的翻譯", async () => {
    await uploadSubtitles(VIDEO, srt);
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ sourceKind: "upload", status: "queued" });
    expect(row.sourceCues).toEqual([
      { start: 1000, end: 2000, text: "안녕" },
      { start: 3000, end: 4000, text: "하세요" },
    ]);
  });

  it("已有翻譯時上傳_取代來源並重置進度", async () => {
    await startTranslation(VIDEO);
    await continueTranslation(VIDEO, { now });
    await uploadSubtitles(VIDEO, srt);
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ sourceKind: "upload", nextBatch: 0, status: "queued" });
    expect(row.translated).toEqual([null, null]);
  });

  it("不是字幕檔_使用者錯誤", async () => {
    await expect(uploadSubtitles(VIDEO, "<html>nope</html>")).rejects.toBeInstanceOf(TranslationUserError);
  });
});

describe("continueTranslation", () => {
  beforeEach(async () => {
    await startTranslation(VIDEO);
  });

  it("在時間預算內處理數批_每批寫回_沒做完回 queued", async () => {
    batchMs = 15_000;
    const progress = await continueTranslation(VIDEO, { now, budgetMs: 40_000 });

    expect(translateBatch).toHaveBeenCalledTimes(2);
    expect(progress).toMatchObject({ status: "queued", done: 60, total: 130 });
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row.nextBatch).toBe(2);
    expect(row.translated[0]).toBe("中 문장 0");
    expect(row.translated[125]).toBeNull();
    expect(row.provider).toBe("anthropic");
    expect(row.model).toBe("claude-haiku-4-5");
  });

  it("全部翻完_狀態 done_回傳完整譯文", async () => {
    const progress = await continueTranslation(VIDEO, { now });
    expect(progress.status).toBe("done");
    expect(progress.translated.every((t) => t?.startsWith("中 "))).toBe(true);
  });

  it("把金鑰、模型、專有名詞與前後各 3 句傳給翻譯", async () => {
    await continueTranslation(VIDEO, { now });
    const second = translateBatch.mock.calls[1][0];
    expect(second.ai).toEqual({ provider: "anthropic", apiKey: "sk-ant-secret-1234", model: "claude-haiku-4-5" });
    expect(second.glossary).toEqual([{ source: "지수", target: "Jisoo" }]);
    expect(second.batch).toEqual({ start: 30, end: 60 });
    expect(second.context).toEqual({ before: ["문장 27", "문장 28", "문장 29"], after: ["문장 60", "문장 61", "문장 62"] });
  });

  it("AI 錯誤_狀態 failed_保留已完成的批次_訊息附建議", async () => {
    translateBatch
      .mockImplementationOnce(async ({ batch }: { batch: { start: number; end: number } }) => Array(batch.end - batch.start).fill("好"))
      .mockRejectedValueOnce(new AiError("rate_limit", "Claude 請求太頻繁，請約 20 秒後再試"));

    const progress = await continueTranslation(VIDEO, { now });

    expect(progress.status).toBe("failed");
    expect(progress.error).toContain("20 秒");
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row.nextBatch).toBe(1);
    expect(row.translated[0]).toBe("好");
  });

  it("非 AI 的例外_failed_訊息不外洩細節", async () => {
    translateBatch.mockRejectedValueOnce(new Error("secret internal detail"));
    const progress = await continueTranslation(VIDEO, { now });
    expect(progress.status).toBe("failed");
    expect(progress.error).not.toContain("secret");
  });

  it("重試失敗_從中斷的批次繼續", async () => {
    translateBatch.mockRejectedValueOnce(new AiError("network", "連不上"));
    await continueTranslation(VIDEO, { now });
    await retryTranslation(VIDEO);
    translateBatch.mockClear();

    const progress = await continueTranslation(VIDEO, { now });

    expect(progress.status).toBe("done");
    expect(translateBatch.mock.calls[0][0].batch).toEqual({ start: 0, end: 30 });
  });

  it("failed 狀態下直接 continue_不會自動重跑", async () => {
    translateBatch.mockRejectedValueOnce(new AiError("auth", "金鑰錯"));
    await continueTranslation(VIDEO, { now });
    translateBatch.mockClear();
    const progress = await continueTranslation(VIDEO, { now });
    expect(progress.status).toBe("failed");
    expect(translateBatch).not.toHaveBeenCalled();
  });

  it("別人正在翻（running 且心跳新）_不重複處理", async () => {
    await getDb().update(youtubeTranslations).set({ status: "running", updatedAt: new Date(clock - 10_000) });
    const progress = await continueTranslation(VIDEO, { now });
    expect(translateBatch).not.toHaveBeenCalled();
    expect(progress).toMatchObject({ status: "running", busy: true });
  });

  it("running 但心跳過期_接手繼續", async () => {
    await getDb().update(youtubeTranslations).set({ status: "running", updatedAt: new Date(clock - 10 * 60_000) });
    const progress = await continueTranslation(VIDEO, { now });
    expect(progress.status).toBe("done");
  });

  it("重新翻譯_清空譯文從頭開始", async () => {
    await continueTranslation(VIDEO, { now });
    await restartTranslation(VIDEO);
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ status: "queued", nextBatch: 0, error: null });
    expect(row.translated.every((t) => t === null)).toBe(true);
  });

  it("沒有翻譯紀錄_使用者錯誤", async () => {
    await expect(continueTranslation("aaaaaaaaaaa", { now })).rejects.toBeInstanceOf(TranslationUserError);
  });
});

describe("continueTranslation：鎖的擁有權", () => {
  const srt = "1\n00:00:01,000 --> 00:00:02,000\n안녕\n\n2\n00:00:03,000 --> 00:00:04,000\n하세요\n";
  const old = ({ cues: all, batch }: BatchArgs) => all.slice(batch.start, batch.end).map((c) => `舊 ${c.text}`);

  beforeEach(async () => {
    await startTranslation(VIDEO);
  });

  it("翻譯中上傳字幕_原本的請求停止，不把舊譯文寫回新字幕", async () => {
    translateBatch.mockImplementationOnce(async (args: BatchArgs) => {
      await uploadSubtitles(VIDEO, srt);
      return old(args);
    });

    await continueTranslation(VIDEO, { now });

    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ sourceKind: "upload", status: "queued", nextBatch: 0, translated: [null, null] });
    expect(row.translated).toHaveLength(row.sourceCues.length);
    expect(translateBatch).toHaveBeenCalledOnce();
  });

  it("翻譯中按重新翻譯_原本的請求停止，不把舊進度寫回", async () => {
    translateBatch.mockImplementationOnce(async (args: BatchArgs) => {
      await restartTranslation(VIDEO);
      return old(args);
    });

    await continueTranslation(VIDEO, { now });

    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ status: "queued", nextBatch: 0 });
    expect(row.translated).toEqual(Array(130).fill(null));
    expect(translateBatch).toHaveBeenCalledOnce();
  });

  it("失敗後別人重試接手_卡住的舊請求醒來也寫不回去", async () => {
    let retried: Progress | undefined;
    translateBatch
      .mockImplementationOnce(async (args: BatchArgs) => {
        clock += 10 * 60_000; // 卡住超過鎖的期限：另一個請求接手後失敗，使用者再按重試並翻完
        retried = await continueTranslation(VIDEO, { now });
        await retryTranslation(VIDEO);
        retried = await continueTranslation(VIDEO, { now });
        return old(args);
      })
      .mockRejectedValueOnce(new AiError("network", "連不上"));

    await continueTranslation(VIDEO, { now });

    expect(retried?.status).toBe("done");
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ status: "done", nextBatch: 5, error: null });
    expect(row.translated.every((t) => t?.startsWith("中 "))).toBe(true);
  });

  it("心跳過期被接手後_原本的請求寫回失敗就停止，不覆蓋接手者的結果、不重翻", async () => {
    let takeover: Progress | undefined;
    translateBatch.mockImplementationOnce(async (args: BatchArgs) => {
      clock += 10 * 60_000; // 卡住超過鎖的期限，另一個請求接手並翻完
      takeover = await continueTranslation(VIDEO, { now });
      return old(args);
    });

    const original = await continueTranslation(VIDEO, { now });

    expect(takeover?.status).toBe("done");
    expect(original).toMatchObject({ status: "done", busy: true });
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ status: "done", nextBatch: 5 });
    expect(row.translated.every((t) => t?.startsWith("中 "))).toBe(true);
    expect(translateBatch).toHaveBeenCalledTimes(6);
  });

  it("批次進行中每次呼叫 AI 前更新心跳_同時進來的請求不會接手", async () => {
    let concurrent: Progress | undefined;
    translateBatch.mockImplementationOnce(async (args: BatchArgs) => {
      await args.beforeCall?.();
      clock += 100_000; // 第一次呼叫 AI 花了 100 秒（句數不符）
      await args.beforeCall?.();
      clock += 100_000; // 重試又花了 100 秒
      concurrent = await continueTranslation(VIDEO, { now });
      return old(args);
    });

    await continueTranslation(VIDEO, { now });

    expect(concurrent).toMatchObject({ status: "running", busy: true });
    expect(translateBatch).toHaveBeenCalledOnce();
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ status: "queued", nextBatch: 1 });
  });
});

describe("continueTranslation：觀看中（帶播放位置）", () => {
  // 每句 3 秒、共 130 句（6 分半）：第 20 句在 60 秒出現，第 100 句在 300 秒
  const timedCues = Array.from({ length: 130 }, (_, i) => ({ start: i * 3000, end: i * 3000 + 2500, text: `문장 ${i}` }));
  const at = (positionMs: number) => continueTranslation(VIDEO, { now, positionMs });
  const sentBatches = () => translateBatch.mock.calls.map(([args]) => (args as BatchArgs).batch);

  beforeEach(async () => {
    fetchKoreanCaptions.mockResolvedValue({ ok: true, kind: "manual", language: "ko", cues: timedCues });
    await startTranslation(VIDEO);
  });

  it("從播放位置那一句開始_第一段只翻 10 句_寫回就回傳_進度以已翻句數計算", async () => {
    const progress = await at(60_500);

    expect(sentBatches()).toEqual([{ start: 20, end: 30 }]);
    expect(translateBatch.mock.calls[0][0].context).toEqual({ before: ["문장 17", "문장 18", "문장 19"], after: ["문장 30", "문장 31", "문장 32"] });
    expect(progress).toMatchObject({ status: "queued", done: 10, total: 130 });
    expect(progress.translated[20]).toBe("中 문장 20");
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ status: "queued", lockId: null, nextBatch: 0 });
    expect(row.translated.filter((t) => t !== null)).toHaveLength(10);
  });

  it("馬上要播的翻好後_播放位置前方改用正常大小", async () => {
    await at(60_500);
    await at(61_500);
    expect(sentBatches()).toEqual([
      { start: 20, end: 30 },
      { start: 30, end: 60 },
    ]);
  });

  it("前方約 2 分半翻好後從頭依序補_最後整支影片翻完", async () => {
    let progress: Progress | undefined;
    for (let call = 0, position = 60_500; call < 10 && progress?.status !== "done"; call++, position += 1000) progress = await at(position);

    expect(sentBatches()).toEqual([
      { start: 20, end: 30 },
      { start: 30, end: 60 },
      { start: 60, end: 90 },
      { start: 0, end: 20 },
      { start: 90, end: 120 },
      { start: 120, end: 130 },
    ]);
    expect(progress).toMatchObject({ status: "done", done: 130 });
    expect(progress?.translated.every((t) => t?.startsWith("中 "))).toBe(true);
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ status: "done", nextBatch: 5, lockId: null });
  });

  it("拖到後面_下一次呼叫從新位置優先翻", async () => {
    await at(60_500);
    await at(300_500);
    expect(sentBatches()).toEqual([
      { start: 20, end: 30 },
      { start: 100, end: 110 },
    ]);
  });

  it("觀看中被上傳換掉字幕_原本的請求不把舊譯文寫回新字幕", async () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\n안녕\n";
    translateBatch.mockImplementationOnce(async ({ cues: all, batch }: BatchArgs) => {
      await uploadSubtitles(VIDEO, srt);
      return all.slice(batch.start, batch.end).map((c) => `舊 ${c.text}`);
    });

    const progress = await at(60_500);

    expect(progress).toMatchObject({ busy: true, status: "queued" });
    const [row] = await testDb.select().from(youtubeTranslations);
    expect(row).toMatchObject({ sourceKind: "upload", status: "queued", translated: [null] });
  });
});
