import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { coreEnv } from "./env";
import { logError } from "./errors";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = "v1";

// 底層的 AES-256-GCM 輸出沒有版本前綴的舊格式
// 模組要用 encryptSecret 才能換金鑰
export function encrypt(plain: string, keyBase64: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decrypt(payload: string, keyBase64: string): string {
  const raw = Buffer.from(payload, "base64");
  // 固定標籤長度 不指定的話截短的標籤也會被接受 竄改比較容易過關
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), raw.subarray(0, IV_LENGTH), { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString("utf8");
}

type Key = { id: string; secret: string };
export type Keyring = { current: Key; previous: Key[] };

export function createKeyring(current: string, previous: readonly string[] = []): Keyring {
  return { current: toKey(current), previous: previous.map(toKey) };
}

// 要標出是哪把金鑰加密的又不能洩漏金鑰 所以只取 SHA-256 的前 8 個 hex
function toKey(secret: string): Key {
  return { id: createHash("sha256").update(Buffer.from(secret, "base64")).digest("hex").slice(0, 8), secret };
}

let envKeyring: Keyring | undefined;

function keyringFromEnv(): Keyring {
  envKeyring ??= createKeyring(coreEnv().ENCRYPTION_KEY, coreEnv().ENCRYPTION_KEY_PREVIOUS);
  return envKeyring;
}

// 訊息固定不含密文 畫面和 log 都能安全使用
export class DecryptionError extends Error {
  name = "DecryptionError";

  constructor(readonly reason: "malformed" | "unknown_key" | "auth_failed") {
    super(`無法解密（${reason}）`);
  }
}

// 舊格式是純 base64 不會有點號 有點號就一定是新格式
function parsePayload(payload: string): { keyId: string | null; body: string } {
  if (!payload.includes(".")) return { keyId: null, body: payload };
  const [version, keyId, body, ...rest] = payload.split(".");
  if (version !== VERSION || !keyId || !body || rest.length > 0) throw new DecryptionError("malformed");
  return { keyId, body };
}

/** 一律用目前的金鑰加密 格式是 v1 keyId 密文 用點號隔開 */
export function encryptSecret(plain: string, keyring: Keyring = keyringFromEnv()): string {
  return [VERSION, keyring.current.id, encrypt(plain, keyring.current.secret)].join(".");
}

export function decryptSecret(payload: string, keyring: Keyring = keyringFromEnv()): string {
  const { keyId, body } = parsePayload(payload);
  const keys = [keyring.current, ...keyring.previous];
  // 舊格式沒有 keyId 只能逐把試 GCM 的驗證標籤會擋下錯的金鑰
  const candidates = keyId === null ? keys : keys.filter((key) => key.id === keyId);
  if (candidates.length === 0) throw new DecryptionError("unknown_key");
  for (const key of candidates) {
    try {
      return decrypt(body, key.secret);
    } catch {
      // 換下一把
    }
  }
  throw new DecryptionError("auth_failed");
}

export function needsReencrypt(payload: string, keyring: Keyring = keyringFromEnv()): boolean {
  return !payload.startsWith(`${VERSION}.${keyring.current.id}.`);
}

export type ReencryptOptions<T> = {
  /** 存在資料庫的密文 */
  ciphertext: (item: T) => string;
  /** 只在密文還是讀出來的那一份時寫回 回傳有沒有寫入 這期間換上的新值不能被舊的蓋掉 */
  write: (item: T, ciphertext: string) => Promise<boolean>;
  /** 單筆失敗的 log 例如 module 是 youtube what 是 API Key 重新加密失敗 context 是 provider */
  log: { module: string; what: string; context?: (item: T) => string | number | null };
  keyring?: Keyring;
};

/**
 * 換金鑰的排程 還不是目前金鑰加密的逐筆解開再加密寫回 單筆失敗不影響其他筆
 * 回傳寫回與失敗的筆數 已經是目前金鑰的不算 失敗的只在 log 記種類
 */
export async function reencryptEach<T>(items: readonly T[], { ciphertext, write, log, keyring = keyringFromEnv() }: ReencryptOptions<T>): Promise<{ reencrypted: number; failed: number }> {
  let reencrypted = 0;
  let failed = 0;
  for (const item of items.filter((candidate) => needsReencrypt(ciphertext(candidate), keyring))) {
    try {
      if (await write(item, encryptSecret(decryptSecret(ciphertext(item), keyring), keyring))) reencrypted++;
    } catch (error) {
      failed++;
      logError(log.module, log.what, error, ...(log.context ? [log.context(item)] : []));
    }
  }
  return { reencrypted, failed };
}

/** 長度不同也不會提早結束的比對 用在密碼與 token */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
