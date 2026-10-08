import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, mocksOf } from "@/dev/test-helpers";
import { starrailAccounts } from "../data/schema";

vi.mock("../lib/hoyolab", { spy: true });

const CURRENT = randomBytes(32).toString("base64");
const OLD = randomBytes(32).toString("base64");
const OLDER = randomBytes(32).toString("base64");

stubCoreEnv({ ENCRYPTION_KEY: CURRENT, ENCRYPTION_KEY_PREVIOUS: `${OLD},${OLDER}` });

const { fetchDailyNote } = mocksOf(await import("../lib/hoyolab"), "fetchDailyNote");
const { createKeyring, decryptSecret, encrypt, encryptSecret, needsReencrypt } = await import("@/core/crypto");
const { getDailyNote, reencryptCookies } = await import("./accounts");

const getDb = setupTestDb();
const cookie = (uid: string) => `ltoken_v2=v2_secret_${uid}; ltuid_v2=${uid}`;
const insertAccount = (uid: string, cookieEncrypted: string) =>
  getDb().insert(starrailAccounts).values({ ltuid: uid, uid, region: "prod_official_asia", cookieEncrypted }).returning();
const storedCookie = async (uid: string) => (await getDb().select().from(starrailAccounts).where(eq(starrailAccounts.uid, uid)))[0].cookieEncrypted;

beforeEach(() => {
  fetchDailyNote.mockReset().mockResolvedValue({ ok: false, retcode: -1, message: "略過", cookieInvalid: false, raw: null });
});

describe("換金鑰後、重新加密前（PGlite 整合）", () => {
  it("舊金鑰加密的 cookie_照常解開使用_不標記失效", async () => {
    const [account] = await insertAccount("1", encryptSecret(cookie("1"), createKeyring(OLD)));

    await getDailyNote(account);

    expect(fetchDailyNote).toHaveBeenCalledWith(cookie("1"), "1", "prod_official_asia");
    const [after] = await getDb().select().from(starrailAccounts);
    expect(after.cookieInvalid).toBe(false);
  });
});

describe("reencryptCookies（PGlite 整合）", () => {
  it("舊金鑰與舊格式的 cookie 改用目前金鑰_目前金鑰的不動", async () => {
    const current = encryptSecret(cookie("1"));
    await insertAccount("1", current);
    await insertAccount("2", encryptSecret(cookie("2"), createKeyring(OLD)));
    await insertAccount("3", encrypt(cookie("3"), OLDER));
    await insertAccount("4", encrypt(cookie("4"), CURRENT));

    expect(await reencryptCookies()).toBe("4 筆 cookie，重新加密 3 筆");

    expect(await storedCookie("1")).toBe(current);
    for (const uid of ["2", "3", "4"]) {
      const stored = await storedCookie(uid);
      expect(needsReencrypt(stored)).toBe(false);
      // 重新加密完就可以移除 ENCRYPTION_KEY_PREVIOUS
      expect(decryptSecret(stored, createKeyring(CURRENT))).toBe(cookie(uid));
    }
  });

  it("解不開的跳過並計入失敗_其他照樣處理_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    const lost = encryptSecret(cookie("1"), createKeyring(randomBytes(32).toString("base64")));
    await insertAccount("1", lost);
    await insertAccount("2", encryptSecret(cookie("2"), createKeyring(OLD)));

    expect(await reencryptCookies()).toBe("2 筆 cookie，重新加密 1 筆（1 筆失敗，詳見伺服器 log）");

    expect(await storedCookie("1")).toBe(lost);
    expect(decryptSecret(await storedCookie("2"), createKeyring(CURRENT))).toBe(cookie("2"));
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]).toContain("unknown_key");
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("v2_secret");
    expect(logged).not.toContain(lost.split(".")[2]);
  });

  it("全部已是目前金鑰_再跑一次也不變", async () => {
    const current = encryptSecret(cookie("1"));
    await insertAccount("1", current);

    expect(await reencryptCookies()).toBe("1 筆 cookie，重新加密 0 筆");
    expect(await storedCookie("1")).toBe(current);
  });

  it("沒有連結的帳號", async () => {
    expect(await reencryptCookies()).toBe("沒有連結的帳號");
  });
});
