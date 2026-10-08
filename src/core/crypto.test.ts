import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { DecryptionError, createKeyring, decrypt, decryptSecret, encrypt, encryptSecret, needsReencrypt, safeEqual } from "./crypto";

const key = randomBytes(32).toString("base64");

describe("encrypt / decrypt", () => {
  it("加密後可以還原，含中文與符號", () => {
    const plain = "ltoken_v2=abc; ltuid_v2=123; 中文=値";
    expect(decrypt(encrypt(plain, key), key)).toBe(plain);
  });

  it("同一段文字每次加密結果不同（隨機 IV）", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });

  it("密文被竄改時解密失敗", () => {
    const raw = Buffer.from(encrypt("secret", key), "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(() => decrypt(raw.toString("base64"), key)).toThrow();
  });

  it("用錯金鑰解密失敗", () => {
    const other = randomBytes(32).toString("base64");
    expect(() => decrypt(encrypt("secret", key), other)).toThrow();
  });
});

describe("safeEqual", () => {
  it.each([
    ["abc", "abc", true],
    ["abc", "abd", false],
    ["abc", "abcd", false],
    ["", "", true],
  ])("safeEqual(%j, %j) = %s", (a, b, expected) => {
    expect(safeEqual(a, b)).toBe(expected);
  });
});

const newKey = () => randomBytes(32).toString("base64");
const keyIdOf = (k: string) => createHash("sha256").update(Buffer.from(k, "base64")).digest("hex").slice(0, 8);

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("預期要丟出錯誤");
}

describe("金鑰環：encryptSecret / decryptSecret / needsReencrypt", () => {
  const current = newKey();
  const old = newKey();
  const older = newKey();
  const keyring = createKeyring(current, [old, older]);

  it("用目前金鑰加密_格式是 v1.<keyId>.<base64>_keyId 是金鑰 SHA-256 的前 8 個 hex", () => {
    const [version, keyId, body, ...rest] = encryptSecret("ltoken_v2=abc", keyring).split(".");

    expect(version).toBe("v1");
    expect(keyId).toBe(keyIdOf(current));
    expect(rest).toEqual([]);
    expect(decrypt(body, current)).toBe("ltoken_v2=abc");
  });

  it("目前金鑰加密的_可以還原_不需要重新加密", () => {
    const payload = encryptSecret("sk-ant-1234；中文", keyring);

    expect(decryptSecret(payload, keyring)).toBe("sk-ant-1234；中文");
    expect(needsReencrypt(payload, keyring)).toBe(false);
  });

  it("舊金鑰加密的_依 keyId 找到舊金鑰還原_需要重新加密", () => {
    const payload = encryptSecret("secret", createKeyring(older));

    expect(decryptSecret(payload, keyring)).toBe("secret");
    expect(needsReencrypt(payload, keyring)).toBe(true);
  });

  it.each([
    ["目前金鑰", () => current],
    ["舊金鑰", () => old],
    ["更舊的金鑰", () => older],
  ])("舊格式（沒有前綴）_%s加密的_逐把嘗試還原_需要重新加密", (_, keyOf) => {
    const legacy = encrypt("secret", keyOf());

    expect(decryptSecret(legacy, keyring)).toBe("secret");
    expect(needsReencrypt(legacy, keyring)).toBe(true);
  });

  it("金鑰環裡沒有那把金鑰_新舊格式都解密失敗", () => {
    const stranger = newKey();

    expect(thrownBy(() => decryptSecret(encryptSecret("secret", createKeyring(stranger)), keyring))).toMatchObject({ reason: "unknown_key" });
    expect(thrownBy(() => decryptSecret(encrypt("secret", stranger), keyring))).toBeInstanceOf(DecryptionError);
  });

  it("舊金鑰從環裡移除後_用它加密的資料解不開", () => {
    const payload = encryptSecret("secret", keyring);
    const rotated = createKeyring(newKey(), [old]);

    expect(thrownBy(() => decryptSecret(payload, rotated))).toBeInstanceOf(DecryptionError);
  });

  it.each([
    ["竄改密文", (p: string) => {
      const [version, keyId, body] = p.split(".");
      const raw = Buffer.from(body, "base64");
      raw[raw.length - 1] ^= 0xff;
      return `${version}.${keyId}.${raw.toString("base64")}`;
    }],
    ["竄改驗證標籤", (p: string) => {
      const [version, keyId, body] = p.split(".");
      const raw = Buffer.from(body, "base64");
      raw[12] ^= 0x01;
      return `${version}.${keyId}.${raw.toString("base64")}`;
    }],
    ["截短密文", (p: string) => p.slice(0, p.lastIndexOf(".") + 20)],
    ["把 keyId 換成另一把金鑰", (p: string) => p.replace(/^v1\.[0-9a-f]{8}\./, `v1.${keyIdOf(old)}.`)],
    ["未知的版本", (p: string) => p.replace(/^v1\./, "v9.")],
    ["段數不對", (p: string) => `${p}.extra`],
  ])("%s_解密失敗_錯誤訊息不含密文", (_, tamper) => {
    const tampered = tamper(encryptSecret("ltoken_v2=top-secret", keyring));

    const error = thrownBy(() => decryptSecret(tampered, keyring));
    expect(error).toBeInstanceOf(DecryptionError);
    expect((error as Error).message).not.toContain(tampered.split(".")[2]);
    expect((error as Error).message).not.toContain("top-secret");
  });

  it("needsReencrypt_格式不認得的也算需要", () => {
    expect(needsReencrypt("v9.whatever.body", keyring)).toBe(true);
    expect(needsReencrypt(`v1.${keyIdOf(old)}.body`, keyring)).toBe(true);
  });
});

describe("沒傳金鑰環時讀環境變數", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("用 ENCRYPTION_KEY 加密_ENCRYPTION_KEY_PREVIOUS 的舊金鑰也能解", async () => {
    const [current, old] = [newKey(), newKey()];
    stubCoreEnv({ ENCRYPTION_KEY: current, ENCRYPTION_KEY_PREVIOUS: old });
    vi.resetModules();
    const fromEnv = await import("./crypto");

    const fresh = fromEnv.encryptSecret("x");
    expect(fresh.split(".")[1]).toBe(keyIdOf(current));
    expect(fromEnv.decryptSecret(fresh)).toBe("x");
    expect(fromEnv.needsReencrypt(fresh)).toBe(false);

    const fromOld = encryptSecret("y", createKeyring(old));
    expect(fromEnv.decryptSecret(fromOld)).toBe("y");
    expect(fromEnv.needsReencrypt(fromOld)).toBe(true);
    expect(fromEnv.decryptSecret(encrypt("z", old))).toBe("z");
  });
});
