import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { youtubeSettings } from "../data/schema";
import { VIDEO_ID } from "../dev/fixtures";

stubCoreEnv();

const { createKeyring, encryptSecret } = await import("@/core/crypto");
const { DEFAULT_MODELS } = await import("../lib/subtitles");
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

    await saveSettings({ provider: "openai", keys: { anthropic: "", openai: "sk-openai-9876" }, clear: [], models: { openai: " gpt-x " }, glossaryText: "" });
    let view = await getSettingsView();
    expect(view.provider).toBe("openai");
    expect(view.keys).toEqual({ anthropic: "sk-ant-s", openai: "sk-opena", gemini: null });
    expect(view.customModels.openai).toBe("gpt-x");
    expect(view.glossaryText).toBe("");
    // 回傳值只有前 8 碼 後面的字與密文都不在裡面
    expect(JSON.stringify(view)).not.toMatch(/ecret|1234|9876/);
    expect(JSON.stringify(view)).not.toContain(row.anthropicKey!);

    await saveSettings({ provider: "openai", keys: {}, clear: ["anthropic"], models: {}, glossaryText: "" });
    view = await getSettingsView();
    expect(view.keys.anthropic).toBeNull();
  });

  it("沒填模型時用預設值", async () => {
    const view = await getSettingsView();
    expect(view.customModels.anthropic).toBe("");
    expect(view.defaultModels.anthropic).toBe("claude-haiku-4-5");
    // 實際會用的模型由 customModels 與 defaultModels 合併 不再另外放一份
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

  it("存著但解不開的 API Key（換了 ENCRYPTION_KEY 卻沒留舊的）_還是算已設定，前幾碼是空字串，讀設定不會出錯", async () => {
    const lost = encryptSecret("sk-ant-lost-1111", createKeyring(randomBytes(32).toString("base64")));
    await getDb().update(youtubeSettings).set({ anthropicKey: lost });

    expect((await getSettingsView()).keys).toEqual({ anthropic: "", openai: null, gemini: null });
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
