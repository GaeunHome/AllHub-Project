import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, mocksOf } from "@/dev/test-helpers";
import { youtubeAiKeys } from "../../data/schema";
import { VIDEO_ID as VIDEO } from "../../dev/fixtures";

vi.mock("../../lib/subtitles", { spy: true });
vi.mock("../../lib/api", { spy: true });

const CURRENT = randomBytes(32).toString("base64");
const OLD = randomBytes(32).toString("base64");
const OLDER = randomBytes(32).toString("base64");

stubCoreEnv({ ENCRYPTION_KEY: CURRENT, ENCRYPTION_KEY_PREVIOUS: `${OLD},${OLDER}` });

const { translateBatch } = mocksOf(await import("../../lib/subtitles"), "translateBatch");
const { fetchVideoInfo } = mocksOf(await import("../../lib/api"), "fetchVideoInfo");

const { createKeyring, decryptSecret, encrypt, encryptSecret, needsReencrypt } = await import("@/core/crypto");
const settings = await import("../ai-settings");
const translation = await import("../translation");
const { reencryptApiKeys } = settings;

const getDb = setupTestDb();
let me: string;

const saveSettings = (input: Parameters<typeof settings.saveSettings>[1]) => settings.saveSettings(me, input);
const getSettingsView = () => settings.getSettingsView(me);

const store = (provider: "anthropic" | "openai" | "gemini", apiKey: string, userId = me) =>
  getDb().insert(youtubeAiKeys).values({ userId, provider, apiKey }).onConflictDoUpdate({ target: [youtubeAiKeys.userId, youtubeAiKeys.provider], set: { apiKey } });
const keyOf = async (provider: string) => (await getDb().select().from(youtubeAiKeys).where(eq(youtubeAiKeys.provider, provider as "openai"))).find((row) => row.userId === me)?.apiKey as string;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  fetchVideoInfo.mockResolvedValue({ title: "影片標題", channelName: null, channelUrl: null });
  translateBatch.mockReset().mockImplementation(async ({ cues, batch }: { cues: { text: string }[]; batch: { start: number; end: number } }) =>
    cues.slice(batch.start, batch.end).map((c) => `中 ${c.text}`),
  );
  await saveSettings({ provider: "anthropic", keys: { anthropic: "sk-ant-current-1111" }, clear: [], models: {}, glossaryText: "" });
});

describe("換金鑰後、重新加密前（PGlite 整合）", () => {
  it("舊金鑰加密的 API Key_照常用來翻譯", async () => {
    await store("anthropic", encryptSecret("sk-ant-old-9999", createKeyring(OLD)));
    await translation.uploadSubtitles({ id: me, role: "owner" }, VIDEO, "1\n00:00:01,000 --> 00:00:02,000\n안녕\n");

    expect(await translation.continueTranslation(me, VIDEO)).toMatchObject({ status: "done" });
    expect(translateBatch.mock.calls[0][0].ai).toMatchObject({ provider: "anthropic", apiKey: "sk-ant-old-9999" });
  });

  it("設定頁照樣看得到前 8 碼：舊金鑰與舊格式加密的都解得開，不用重新貼上", async () => {
    await store("anthropic", encryptSecret("sk-ant-old-9999", createKeyring(OLD)));
    await store("gemini", encrypt("gemini-legacy-3333", OLDER));

    expect((await getSettingsView()).keys).toEqual({ anthropic: "sk-ant-o", openai: null, gemini: "gemini-l" });
  });
});

describe("reencryptApiKeys（PGlite 整合）", () => {
  it("舊金鑰與舊格式的 API Key 改用目前金鑰_目前金鑰的不動_設定頁看到的前 8 碼不變", async () => {
    const before = await keyOf("anthropic");
    await store("openai", encryptSecret("sk-openai-old-2222", createKeyring(OLD)));
    await store("gemini", encrypt("gemini-legacy-3333", OLDER));

    expect(await reencryptApiKeys()).toBe("3 把 API Key，重新加密 2 把");

    expect(await keyOf("anthropic")).toBe(before);
    // 重新加密完就可以移除 ENCRYPTION_KEY_PREVIOUS
    expect(decryptSecret(await keyOf("openai"), createKeyring(CURRENT))).toBe("sk-openai-old-2222");
    expect(decryptSecret(await keyOf("gemini"), createKeyring(CURRENT))).toBe("gemini-legacy-3333");
    expect(needsReencrypt(await keyOf("openai")) || needsReencrypt(await keyOf("gemini"))).toBe(false);
    expect((await getSettingsView()).keys).toEqual({ anthropic: "sk-ant-c", openai: "sk-opena", gemini: "gemini-l" });
  });

  it("解不開的跳過並計入失敗_其他照樣處理_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    const lost = encryptSecret("sk-openai-lost-2222", createKeyring(randomBytes(32).toString("base64")));
    await store("openai", lost);
    await store("gemini", encrypt("gemini-legacy-3333", OLDER));

    expect(await reencryptApiKeys()).toBe("3 把 API Key，重新加密 1 把（1 把失敗，詳見伺服器 log）");

    expect(await keyOf("openai")).toBe(lost);
    expect(decryptSecret(await keyOf("gemini"), createKeyring(CURRENT))).toBe("gemini-legacy-3333");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]).toContain("unknown_key");
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("sk-");
    expect(logged).not.toContain(lost.split(".")[2]);
  });

  it("每個人的 API Key 都會重新加密", async () => {
    const other = await insertTestUser(getDb(), "bob");
    await store("openai", encryptSecret("sk-openai-old-2222", createKeyring(OLD)), other);
    await store("gemini", encrypt("gemini-legacy-3333", OLDER), other);

    expect(await reencryptApiKeys()).toBe("3 把 API Key，重新加密 2 把");
  });
});
