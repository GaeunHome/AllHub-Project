import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, mocksOf } from "@/dev/test-helpers";
import { youtubeSettings } from "../data/schema";

vi.mock("../lib/subtitles", { spy: true });
vi.mock("../lib/api", { spy: true });

const CURRENT = randomBytes(32).toString("base64");
const OLD = randomBytes(32).toString("base64");
const OLDER = randomBytes(32).toString("base64");

stubCoreEnv({ ENCRYPTION_KEY: CURRENT, ENCRYPTION_KEY_PREVIOUS: `${OLD},${OLDER}` });

const { translateBatch } = mocksOf(await import("../lib/subtitles"), "translateBatch");
const { fetchVideoTitle } = mocksOf(await import("../lib/api"), "fetchVideoTitle");

const { createKeyring, decryptSecret, encrypt, encryptSecret, needsReencrypt } = await import("@/core/crypto");
const translation = await import("./translation");
const { reencryptApiKeys } = translation;

const getDb = setupTestDb();
const VIDEO = "dQw4w9WgXcQ";
let me: string;

const saveSettings = (input: Parameters<typeof translation.saveSettings>[1]) => translation.saveSettings(me, input);
const getSettingsView = () => translation.getSettingsView(me);

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  fetchVideoTitle.mockResolvedValue("影片標題");
  translateBatch.mockReset().mockImplementation(async ({ cues, batch }: { cues: { text: string }[]; batch: { start: number; end: number } }) =>
    cues.slice(batch.start, batch.end).map((c) => `中 ${c.text}`),
  );
  await saveSettings({ provider: "anthropic", keys: { anthropic: "sk-ant-current-1111" }, clear: [], models: {}, glossaryText: "" });
});

describe("換金鑰後、重新加密前（PGlite 整合）", () => {
  it("舊金鑰加密的 API Key_照常用來翻譯", async () => {
    await getDb().update(youtubeSettings).set({ anthropicKey: encryptSecret("sk-ant-old-9999", createKeyring(OLD)) });
    await translation.uploadSubtitles({ id: me, role: "owner" }, VIDEO, "1\n00:00:01,000 --> 00:00:02,000\n안녕\n");

    expect(await translation.continueTranslation(me, VIDEO)).toMatchObject({ status: "done" });
    expect(translateBatch.mock.calls[0][0].ai).toMatchObject({ provider: "anthropic", apiKey: "sk-ant-old-9999" });
  });
});

describe("reencryptApiKeys（PGlite 整合）", () => {
  it("舊金鑰與舊格式的 API Key 改用目前金鑰_目前金鑰的不動_hint 不變", async () => {
    const [before] = await getDb().select().from(youtubeSettings);
    await getDb()
      .update(youtubeSettings)
      .set({
        openaiKey: encryptSecret("sk-openai-old-2222", createKeyring(OLD)),
        openaiKeyHint: "2222",
        geminiKey: encrypt("gemini-legacy-3333", OLDER),
        geminiKeyHint: "3333",
      });

    expect(await reencryptApiKeys()).toBe("3 把 API Key，重新加密 2 把");

    const [after] = await getDb().select().from(youtubeSettings);
    expect(after.anthropicKey).toBe(before.anthropicKey);
    // 重新加密完就可以移除 ENCRYPTION_KEY_PREVIOUS
    expect(decryptSecret(after.openaiKey!, createKeyring(CURRENT))).toBe("sk-openai-old-2222");
    expect(decryptSecret(after.geminiKey!, createKeyring(CURRENT))).toBe("gemini-legacy-3333");
    expect(needsReencrypt(after.openaiKey!) || needsReencrypt(after.geminiKey!)).toBe(false);
    expect((await getSettingsView()).keys).toEqual({ anthropic: "1111", openai: "2222", gemini: "3333" });
  });

  it("解不開的跳過並計入失敗_其他照樣處理_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    const lost = encryptSecret("sk-openai-lost-2222", createKeyring(randomBytes(32).toString("base64")));
    await getDb().update(youtubeSettings).set({ openaiKey: lost, geminiKey: encrypt("gemini-legacy-3333", OLDER) });

    expect(await reencryptApiKeys()).toBe("3 把 API Key，重新加密 1 把（1 把失敗，詳見伺服器 log）");

    const [after] = await getDb().select().from(youtubeSettings);
    expect(after.openaiKey).toBe(lost);
    expect(decryptSecret(after.geminiKey!, createKeyring(CURRENT))).toBe("gemini-legacy-3333");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]).toContain("unknown_key");
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("sk-");
    expect(logged).not.toContain(lost.split(".")[2]);
  });

  it("每個人的 API Key 都會重新加密，包括沒有擁有者的列（部署空窗期舊程式寫的）", async () => {
    const other = await insertTestUser(getDb(), "bob");
    await translation.saveSettings(other, { provider: "openai", keys: {}, clear: [], models: {}, glossaryText: "" });
    await getDb().update(youtubeSettings).set({ openaiKey: encryptSecret("sk-openai-old-2222", createKeyring(OLD)) });
    await getDb().insert(youtubeSettings).values({ id: 1, geminiKey: encrypt("gemini-legacy-3333", OLDER) });

    expect(await reencryptApiKeys()).toBe("4 把 API Key，重新加密 3 把");
  });

  it("沒有設定 API Key", async () => {
    await saveSettings({ provider: "anthropic", keys: {}, clear: ["anthropic"], models: {}, glossaryText: "" });

    expect(await reencryptApiKeys()).toBe("沒有設定 API Key");
  });
});
