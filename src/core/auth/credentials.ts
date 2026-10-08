import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-rules.ts";

// 網站與 account CLI 共用這一份；CLI 用純 node 直接載入，只能 import node 內建模組與帶 .ts 副檔名的相對路徑

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH };
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

export type ScryptParams = { N: number; r: number; p: number };

// OWASP 列出與 N=2^17,p=1 等效的組合；N=2^15,p=3 每次只佔 32 MiB，serverless 同時多個登入也不會吃光記憶體
export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 15, r: 8, p: 3 };

const ALGORITHM = "scrypt";
const SALT_BYTES = 16;
const KEY_BYTES = 32;
// 參數是從資料庫的雜湊字串讀出來的，限制範圍，壞掉或被竄改的值才不會讓伺服器卡住或吃光記憶體
const LIMITS = { minLogN: 10, maxLogN: 20, maxR: 32, maxP: 16, maxMemory: 256 * 1024 * 1024 };
const USERNAME_PATTERN = /^[a-z0-9_.-]+$/;

type ParsedHash = { params: ScryptParams; salt: Buffer; hash: Buffer };

/** Node 預設 maxmem 是 32 MiB，N=2^15、r=8 剛好超過，一定要依參數放寬 */
function maxmemFor({ N, r, p }: ScryptParams): number {
  return 128 * r * (N + p + 2) + 1024 * 1024;
}

function derive(password: string, salt: Buffer, params: ScryptParams, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // NFKC：同一個密碼在不同裝置可能用組合字元或預組字元輸入，正規化後才比得起來
    scrypt(password.normalize("NFKC"), salt, keyLength, { ...params, maxmem: maxmemFor(params) }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

function withinLimits({ N, r, p }: ScryptParams): boolean {
  const logN = Math.log2(N);
  return (
    Number.isInteger(logN) &&
    logN >= LIMITS.minLogN &&
    logN <= LIMITS.maxLogN &&
    Number.isInteger(r) &&
    r >= 1 &&
    r <= LIMITS.maxR &&
    Number.isInteger(p) &&
    p >= 1 &&
    p <= LIMITS.maxP &&
    128 * N * r <= LIMITS.maxMemory
  );
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== ALGORITHM) return null;
  const [N, r, p] = parts.slice(1, 4).map((value) => (/^\d+$/.test(value) ? Number(value) : NaN));
  const params = { N, r, p };
  if (!withinLimits(params)) return null;
  const salt = Buffer.from(parts[4], "base64url");
  const hash = Buffer.from(parts[5], "base64url");
  if (salt.length === 0 || hash.length < 16) return null;
  return { params, salt, hash };
}

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, params, KEY_BYTES);
  return [ALGORITHM, params.N, params.r, params.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

/** stored 是 null（帳號不存在）或格式壞掉時，也用預設參數跑一次 scrypt，回應時間才不會透露帳號是否存在 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = stored === null ? null : parseHash(stored);
  if (!parsed) {
    await derive(password, randomBytes(SALT_BYTES), DEFAULT_SCRYPT, KEY_BYTES);
    return false;
  }
  const actual = await derive(password, parsed.salt, parsed.params, parsed.hash.length);
  return timingSafeEqual(actual, parsed.hash);
}

/** 登入成功時順便換成目前的參數，調高強度後舊帳號也會逐漸跟上 */
export function needsRehash(stored: string, params: ScryptParams = DEFAULT_SCRYPT): boolean {
  const parsed = parseHash(stored);
  return !parsed || parsed.params.N !== params.N || parsed.params.r !== params.r || parsed.params.p !== params.p || parsed.hash.length !== KEY_BYTES;
}

export function passwordProblem(password: string): string | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return `密碼至少 ${PASSWORD_MIN_LENGTH} 個字元`;
  if (length > PASSWORD_MAX_LENGTH) return `密碼最多 ${PASSWORD_MAX_LENGTH} 個字元`;
  return null;
}

/** 帳號不分大小寫：一律存小寫，全形英數也換成半形 */
export function normalizeUsername(input: string): string {
  return input.normalize("NFKC").trim().toLowerCase();
}

/** 傳入 normalizeUsername 之後的值 */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) return `帳號要 ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} 個字元`;
  if (!USERNAME_PATTERN.test(username)) return "帳號只能用英文小寫、數字、底線（_）、點（.）與連字號（-）";
  return null;
}
