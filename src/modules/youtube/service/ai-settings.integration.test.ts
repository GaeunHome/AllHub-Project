import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { youtubeSettings } from "../data/schema";
import { VIDEO_ID } from "../dev/fixtures";

stubCoreEnv();

const { createKeyring, encryptSecret } = await import("@/core/crypto");
const { AI_MODELS, DEFAULT_MODELS } = await import("../lib/subtitles");
const settings = await import("./ai-settings");
const translation = await import("./translation");
const { ApiKeySetupError, TranslationUserError } = await import("./errors");

let testDb: TestDb;
const getDb = setupTestDb((d) => (testDb = d));
/** me 與 other 是成員 boss 是站長 */
let me: string;
let other: string;
let boss: string;

// 沒特別說的都是 me 在操作
const saveSettings = (input: Parameters<typeof settings.saveSettings>[1]) => settings.saveSettings(me, input);
const getSettingsView = () => settings.getSettingsView(me);
const missingApiKeyMessage = () => settings.missingApiKeyMessage(me);

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice");
  other = await insertTestUser(getDb(), "bob");
  boss = await insertTestUser(getDb(), "boss", { role: "owner" });
  await saveSettings({ provider: "anthropic", keys: { anthropic: "sk-ant-secret-1234" }, clear: [], models: {}, glossaryText: "지수=Jisoo" });
});

describe("設定", () => {
  it("金鑰加密儲存_畫面只看到前 8 碼（讀設定時解開來取）_留空不變更_可清除", async () => {
    const [row] = await testDb.select().from(youtubeSettings);
    expect(row.anthropicKey).not.toContain("sk-ant");

    await saveSettings({ provider: "openai", keys: { anthropic: "", openai: "sk-openai-9876" }, clear: [], models: { openai: "gpt-6.1-sol" }, glossaryText: "" });
    let view = await getSettingsView();
    expect(view.provider).toBe("openai");
    expect(view.keys).toEqual({ anthropic: "sk-ant-s", openai: "sk-opena", gemini: null });
    expect(view.models.openai).toBe("gpt-6.1-sol");
    expect(view.glossaryText).toBe("");
    // 回傳值只有前 8 碼 後面的字與密文都不在裡面
    expect(JSON.stringify(view)).not.toMatch(/ecret|1234|9876/);
    expect(JSON.stringify(view)).not.toContain(row.anthropicKey!);

    await saveSettings({ provider: "openai", keys: {}, clear: ["anthropic"], models: {}, glossaryText: "" });
    view = await getSettingsView();
    expect(view.keys.anthropic).toBeNull();
  });

  it("還沒存過模型_一進去就是預設模型（不是空的），呼叫 AI 也用它", async () => {
    expect((await getSettingsView()).models).toEqual(DEFAULT_MODELS);
    expect((await settings.currentAi(me)).ai.model).toBe(DEFAULT_MODELS.anthropic);
  });

  it("觀看頁的金鑰提示：目前的供應商有金鑰回 null，沒有就回要去設定的提示", async () => {
    expect(await missingApiKeyMessage()).toBeNull();

    await saveSettings({ provider: "gemini", keys: {}, clear: [], models: {}, glossaryText: "" });
    expect(await missingApiKeyMessage()).toContain("還沒設定 Gemini 的 API Key");
  });

  it("存進資料庫的是實際的模型 id：預設模型也一樣，下拉選單送什麼就存什麼", async () => {
    await saveSettings({ provider: "anthropic", keys: {}, clear: [], models: { anthropic: "claude-sonnet-5-5", openai: DEFAULT_MODELS.openai, gemini: "gemini-3.5-flash-lite" }, glossaryText: "" });

    const [row] = await testDb.select().from(youtubeSettings);
    expect(row).toMatchObject({ anthropicModel: "claude-sonnet-5-5", openaiModel: DEFAULT_MODELS.openai, geminiModel: "gemini-3.5-flash-lite" });
    expect((await settings.currentAi(me)).ai.model).toBe("claude-sonnet-5-5");
  });

  it("存著但解不開的 API Key（換了 ENCRYPTION_KEY 卻沒留舊的）_還是算已設定，前幾碼是空字串，讀設定不會出錯", async () => {
    const lost = encryptSecret("sk-ant-lost-1111", createKeyring(randomBytes(32).toString("base64")));
    await getDb().update(youtubeSettings).set({ anthropicKey: lost });

    expect((await getSettingsView()).keys).toEqual({ anthropic: "", openai: null, gemini: null });
  });
});

describe("模型只接受清單裡的或這個人原本存的（Server Action 可以被直接 POST，不能只靠下拉選單）", () => {
  const withModels = (models: Parameters<typeof settings.saveSettings>[1]["models"]) => ({ provider: "anthropic" as const, keys: {}, clear: [], models, glossaryText: "" });
  const storeModel = (userId: string, openaiModel: string) => getDb().update(youtubeSettings).set({ openaiModel }).where(eq(youtubeSettings.userId, userId));

  it("每家清單裡的模型都收得下", async () => {
    for (const [provider, models] of Object.entries(AI_MODELS)) {
      for (const { id } of models) await expect(saveSettings(withModels({ [provider]: id }))).resolves.toBeUndefined();
    }
  });

  it.each([
    ["不在清單裡", "gpt-made-up"],
    ["留空", ""],
    ["只有空白", "   "],
    ["別家的模型", "claude-haiku-5-5"],
  ])("%s → 回中文錯誤，整份設定都不寫入（金鑰也不換）", async (_name, model) => {
    const error = await saveSettings({ ...withModels({ openai: model }), provider: "openai", keys: { openai: "sk-openai-new-0000" } }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TranslationUserError);
    expect((error as Error).message).toContain("模型");
    expect(await getSettingsView()).toMatchObject({ provider: "anthropic", keys: { openai: null }, models: DEFAULT_MODELS });
  });

  it("以前存的自訂模型不在清單裡_讀得到、送原本的值存得下，不會被洗掉，呼叫 AI 照用它", async () => {
    await storeModel(me, "gpt-custom-2025");

    expect((await getSettingsView()).models.openai).toBe("gpt-custom-2025");
    await saveSettings(withModels({ openai: "gpt-custom-2025" }));

    expect((await testDb.select().from(youtubeSettings).where(eq(youtubeSettings.userId, me)))[0].openaiModel).toBe("gpt-custom-2025");
  });

  it("換成清單裡的模型後_舊的自訂模型就不收了", async () => {
    await storeModel(me, "gpt-custom-2025");
    await saveSettings(withModels({ openai: "gpt-6.1-sol" }));

    await expect(saveSettings(withModels({ openai: "gpt-custom-2025" }))).rejects.toBeInstanceOf(TranslationUserError);
  });

  it("只認自己原本存的：別人存的自訂模型不收", async () => {
    await settings.saveSettings(other, withModels({}));
    await storeModel(other, "gpt-custom-2025");

    await expect(saveSettings(withModels({ openai: "gpt-custom-2025" }))).rejects.toBeInstanceOf(TranslationUserError);
  });
});

describe("專有名詞表的上限（存檔時檢查）", () => {
  const glossaryOf = (n: number) => Array.from({ length: n }, (_, i) => `이름${i}=名字${i}`).join("\n");

  it("在上限內_照常儲存", async () => {
    await saveSettings({ provider: "anthropic", keys: {}, clear: [], models: {}, glossaryText: glossaryOf(200) });

    expect((await testDb.select().from(youtubeSettings))[0].glossary).toHaveLength(200);
  });

  it.each([
    ["超過 200 筆", glossaryOf(201), "專有名詞表最多 200 筆"],
    ["詞太長", `${"가".repeat(51)}=太長`, "專有名詞表每個詞最多 50 字"],
    ["合計太長", Array.from({ length: 120 }, (_, i) => `${"가".repeat(20)}${i}=${"中".repeat(25)}`).join("\n"), "專有名詞表合計最多 5,000 字"],
  ])("%s_回中文錯誤，整份設定都不寫入（金鑰也不換）", async (_name, glossaryText, message) => {
    const error = await saveSettings({ provider: "openai", keys: { openai: "sk-openai-new-0000" }, clear: [], models: {}, glossaryText }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TranslationUserError);
    expect((error as Error).message).toContain(message);
    const view = await getSettingsView();
    expect(view).toMatchObject({ provider: "anthropic", keys: { openai: null }, glossaryText: "지수=Jisoo" });
  });
});

describe("翻譯設定與 API Key 每人一份", () => {
  it("每個人各自一列：別人存的金鑰不會蓋掉我的，畫面也只看得到自己的前 8 碼", async () => {
    await settings.saveSettings(other, { provider: "gemini", keys: { gemini: "gm-other-5678" }, clear: [], models: {}, glossaryText: "제니=Jennie" });

    expect(await getSettingsView()).toMatchObject({ provider: "anthropic", keys: { anthropic: "sk-ant-s", openai: null, gemini: null }, glossaryText: "지수=Jisoo" });
    expect(await settings.getSettingsView(other)).toMatchObject({ provider: "gemini", keys: { anthropic: null, openai: null, gemini: "gm-other" }, glossaryText: "제니=Jennie" });
    expect((await testDb.select().from(youtubeSettings)).map((row) => row.userId).sort()).toEqual([me, other].sort());
  });

  it("還沒設定過的人_提示要先填 API Key", async () => {
    expect(await settings.missingApiKeyMessage(boss)).toContain("還沒設定 Claude 的 API Key");
    await expect(translation.startTranslation(boss, VIDEO_ID)).rejects.toBeInstanceOf(ApiKeySetupError);
  });

  it("單人版留下的 id = 1 那一列（migration 已歸給站長）照常讀得到；新的列自動編號，不會撞到 1", async () => {
    await getDb().insert(youtubeSettings).values({ id: 1, userId: boss, provider: "openai" });

    expect((await settings.getSettingsView(boss)).provider).toBe("openai");
    const ids = (await testDb.select().from(youtubeSettings)).map((row) => row.id);
    expect(ids.filter((id) => id === 1)).toHaveLength(1);
  });
});
