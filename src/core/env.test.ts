import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_CORE_ENV as CORE, TEST_TWITCH_ENV as TWITCH, TEST_YOUTUBE_ENV as YOUTUBE } from "@/dev/test-env";

const OPTIONAL = ["DATABASE_POOL_MAX", "ENCRYPTION_KEY_PREVIOUS", "DEV_EXTERNAL_ORIGIN", "DEV_CAPTCHA_CODE"];
// 帳號改存資料庫、通知改成網站內通知後就不再使用
const REMOVED = ["APP_PASSWORD", "DISCORD_WEBHOOK_URL"];
const ALL_NAMES = [...new Set([...Object.keys(CORE), ...Object.keys(TWITCH), ...Object.keys(YOUTUBE), ...OPTIONAL, ...REMOVED])];

// env.ts 會快取驗證結果，每個測試都要重新載入；先清掉同名變數，本機 shell 設過的值才不會混進來
async function loadEnv(vars: Record<string, string>) {
  for (const name of ALL_NAMES) vi.stubEnv(name, undefined);
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  vi.resetModules();
  devEnvModule = await import("./env");
  return devEnvModule;
}

// DEV_CAPTCHA_CODE 的格式檢查：devEnv 每次都重新讀取，不必重新載入模組
let devEnvModule: typeof import("./env") | undefined;
function loadEnvSync(code: string) {
  vi.stubEnv("DEV_CAPTCHA_CODE", code);
  return devEnvModule!.devEnv();
}

function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("預期要丟出錯誤");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("分組驗證：用到才驗證", () => {
  it("只填核心設定_coreEnv 正常_沒用到的模組不必填", async () => {
    const env = await loadEnv(CORE);

    expect(env.coreEnv()).toMatchObject({ DATABASE_URL: CORE.DATABASE_URL, DATABASE_POOL_MAX: 5, ENCRYPTION_KEY: CORE.ENCRYPTION_KEY });
  });

  it("用到沒填設定的模組才報錯_列出缺少的變數", async () => {
    const env = await loadEnv(CORE);

    const twitch = errorOf(() => env.twitchEnv());
    expect(twitch).toContain("Twitch 模組環境變數設定有誤");
    expect(twitch).toContain("TWITCH_CLIENT_ID：未設定");
    expect(twitch).toContain("PUBLIC_BASE_URL：未設定");
    expect(errorOf(() => env.youtubeEnv())).toContain("YOUTUBE_WEBSUB_SECRET：未設定");
  });

  it("模組的設定不需要核心設定_Twitch 與 YouTube 共用 PUBLIC_BASE_URL", async () => {
    const env = await loadEnv({ ...TWITCH, ...YOUTUBE });

    expect(env.twitchEnv()).toEqual(TWITCH);
    expect(env.youtubeEnv()).toEqual(YOUTUBE);
    expect(errorOf(() => env.coreEnv())).toContain("核心環境變數設定有誤");
  });

  it("每組只回自己的變數", async () => {
    const env = await loadEnv({ ...CORE, ...TWITCH, ...YOUTUBE });

    expect(Object.keys(env.youtubeEnv()).sort()).toEqual(["PUBLIC_BASE_URL", "YOUTUBE_WEBSUB_SECRET"]);
    expect(env.twitchEnv()).not.toHaveProperty("DATABASE_URL");
  });
});

describe("值的驗證", () => {
  it("留空（KEY=）視為沒設定_選填的不報錯", async () => {
    const env = await loadEnv({ ...CORE, ENCRYPTION_KEY_PREVIOUS: "", DATABASE_POOL_MAX: "" });

    expect(env.coreEnv().ENCRYPTION_KEY_PREVIOUS).toEqual([]);
    expect(env.coreEnv().DATABASE_POOL_MAX).toBe(5);
  });

  it("必填的留空_報未設定", async () => {
    const env = await loadEnv({ ...CORE, SESSION_SECRET: "" });

    expect(errorOf(() => env.coreEnv())).toContain("SESSION_SECRET：未設定");
  });

  it("ENCRYPTION_KEY_PREVIOUS 沒設定_是空陣列", async () => {
    const env = await loadEnv({ ...CORE, ENCRYPTION_KEY_PREVIOUS: "" });

    expect(env.coreEnv().ENCRYPTION_KEY_PREVIOUS).toEqual([]);
  });

  it("ENCRYPTION_KEY_PREVIOUS 可以放多把_逗號分隔_忽略空白", async () => {
    const [a, b] = [Buffer.alloc(32, 2).toString("base64"), Buffer.alloc(32, 3).toString("base64")];
    const env = await loadEnv({ ...CORE, ENCRYPTION_KEY_PREVIOUS: ` ${a} ,${b},` });

    expect(env.coreEnv().ENCRYPTION_KEY_PREVIOUS).toEqual([a, b]);
  });

  it("ENCRYPTION_KEY_PREVIOUS 每把都要是 32 bytes 的 base64", async () => {
    const short = Buffer.alloc(16, 4).toString("base64");
    const env = await loadEnv({ ...CORE, ENCRYPTION_KEY_PREVIOUS: `${Buffer.alloc(32, 2).toString("base64")},${short}` });

    const message = errorOf(() => env.coreEnv());
    expect(message).toContain("ENCRYPTION_KEY_PREVIOUS.1：必須是 32 bytes");
    expect(message).not.toContain(short);
  });

  it("格式不對_報原因但不顯示變數的值", async () => {
    const env = await loadEnv({ ...CORE, SESSION_SECRET: "short-session-secret", ENCRYPTION_KEY: "bm90LTMyLWJ5dGVz" });

    const message = errorOf(() => env.coreEnv());
    expect(message).toContain("SESSION_SECRET：SESSION_SECRET 至少 32 個字元");
    expect(message).toContain("ENCRYPTION_KEY：");
    expect(message).not.toContain("short-session-secret");
    expect(message).not.toContain("bm90LTMyLWJ5dGVz");
  });

  it("不再使用 APP_PASSWORD 與 DISCORD_WEBHOOK_URL_沒設定也不報錯、設了也不會讀", async () => {
    const env = await loadEnv({ ...CORE, APP_PASSWORD: "old-password-1234", DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/x" });

    expect(env.coreEnv()).not.toHaveProperty("APP_PASSWORD");
    expect(env.coreEnv()).not.toHaveProperty("DISCORD_WEBHOOK_URL");
    const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
    for (const name of REMOVED) expect(source).not.toContain(name);
  });
});

describe("與 .env.example 一致", () => {
  const namesIn = (file: URL, pattern: RegExp) => [...new Set([...readFileSync(file, "utf8").matchAll(pattern)].map((m) => m[1]))];

  it("env.ts 定義的變數_.env.example 都有列出_順序相同", () => {
    const defined = namesIn(new URL("./env.ts", import.meta.url), /^\s+([A-Z][A-Z0-9_]*):/gm);
    // 註解掉的範例（# NAME=…）也算有列出
    const documented = namesIn(new URL("../../.env.example", import.meta.url), /^#?\s*([A-Z][A-Z0-9_]*)=/gm);

    expect(defined.length).toBeGreaterThanOrEqual(12);
    expect(documented).toEqual(defined);
  });
});

describe("docs/secrets.md 的產生亂數密鑰指令", () => {
  const PROMISED = ["SESSION_SECRET", "ENCRYPTION_KEY", "CRON_SECRET", "TWITCH_EVENTSUB_SECRET", "YOUTUBE_WEBSUB_SECRET"];

  it("實際執行文件裡的 node 指令_印出的每個值都通過 env.ts 的驗證（文件改壞時這裡會失敗）", async () => {
    const doc = readFileSync(new URL("../../docs/secrets.md", import.meta.url), "utf8");
    const command = doc.split("\n").find((line) => line.startsWith('node -e "'));
    expect(command, "docs/secrets.md 找不到 node -e 開頭的指令").toBeDefined();
    const script = command!.slice('node -e "'.length, command!.lastIndexOf('"'));

    const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 30_000 });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const generated = Object.fromEntries(
      result.stdout
        .trim()
        .split("\n")
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    expect(Object.keys(generated).sort()).toEqual([...PROMISED].sort());

    const env = await loadEnv({ ...CORE, ...TWITCH, ...YOUTUBE, ...generated });
    const validated: Record<string, unknown> = { ...env.coreEnv(), ...env.twitchEnv(), ...env.youtubeEnv() };
    for (const [name, value] of Object.entries(generated)) expect(validated[name], name).toBe(value);
  });
});

describe("本機測試設定：devEnv", () => {
  it("不需要核心或模組設定_DEV_EXTERNAL_ORIGIN 選填", async () => {
    const env = await loadEnv({});

    expect(env.devEnv().DEV_EXTERNAL_ORIGIN).toBeUndefined();
  });

  it("有設定_回傳假伺服器網址", async () => {
    const env = await loadEnv({ DEV_EXTERNAL_ORIGIN: "http://127.0.0.1:4010" });

    expect(env.devEnv()).toEqual({ DEV_EXTERNAL_ORIGIN: "http://127.0.0.1:4010" });
  });

  it("DEV_CAPTCHA_CODE 選填_要剛好 5 個驗證碼用的字元；不對時報出名稱但不顯示值", async () => {
    expect((await loadEnv({ DEV_CAPTCHA_CODE: "K7MRX" })).devEnv().DEV_CAPTCHA_CODE).toBe("K7MRX");
    expect((await loadEnv({})).devEnv().DEV_CAPTCHA_CODE).toBeUndefined();

    for (const bad of ["K0MRX", "K7MR", "K7MRXX", "k7mrx"]) {
      const message = errorOf(() => loadEnvSync(bad));
      expect(message).toContain("DEV_CAPTCHA_CODE：");
      expect(message).not.toContain(bad);
    }
  });

  it("不是網址_報出變數名稱但不顯示值", async () => {
    const env = await loadEnv({ DEV_EXTERNAL_ORIGIN: "mock-server-4010" });

    const message = errorOf(() => env.devEnv());
    expect(message).toContain("本機測試環境變數設定有誤");
    expect(message).toContain("DEV_EXTERNAL_ORIGIN：");
    expect(message).not.toContain("mock-server-4010");
  });

  it("每次呼叫都重新讀取_開發中切換假伺服器不必重新載入", async () => {
    const env = await loadEnv({});
    expect(env.devEnv().DEV_EXTERNAL_ORIGIN).toBeUndefined();

    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4010");

    expect(env.devEnv().DEV_EXTERNAL_ORIGIN).toBe("http://127.0.0.1:4010");
  });
});

describe("missingTwitchEnv：列出 Twitch 缺少或格式不對的變數名稱（不含值），加主播時給明確的提示", () => {
  it("都設定了_空陣列", async () => {
    expect((await loadEnv({ ...CORE, ...TWITCH })).missingTwitchEnv()).toEqual([]);
  });

  it("都還沒設定_照 .env.example 的順序列出全部", async () => {
    expect((await loadEnv(CORE)).missingTwitchEnv()).toEqual(["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "TWITCH_EVENTSUB_SECRET", "PUBLIC_BASE_URL"]);
  });

  it("留空當成沒設定、格式不對也列出；訊息只有名稱，不含值", async () => {
    const missing = (await loadEnv({ ...TWITCH, TWITCH_CLIENT_SECRET: "", PUBLIC_BASE_URL: "not-a-url" })).missingTwitchEnv();

    expect(missing).toEqual(["TWITCH_CLIENT_SECRET", "PUBLIC_BASE_URL"]);
    expect(missing.join()).not.toContain("not-a-url");
  });
});

describe("hasTwitchEnv：只回報 Twitch 設定齊不齊、不丟錯", () => {
  it("都設定了_true", async () => {
    const env = await loadEnv({ ...CORE, ...TWITCH });

    expect(env.hasTwitchEnv()).toBe(true);
  });

  it("還沒設定 Twitch 憑證_false_不丟錯_畫面可以退回文字頭像", async () => {
    const env = await loadEnv(CORE);

    expect(env.hasTwitchEnv()).toBe(false);
  });

  it("只缺一個或留空_false", async () => {
    expect((await loadEnv({ ...TWITCH, TWITCH_CLIENT_SECRET: "" })).hasTwitchEnv()).toBe(false);
    expect((await loadEnv({ ...TWITCH, PUBLIC_BASE_URL: "not-a-url" })).hasTwitchEnv()).toBe(false);
  });

  it("true 時 twitchEnv() 一定讀得到_判斷條件跟 twitchEnv() 的驗證一致", async () => {
    const env = await loadEnv({ ...TWITCH });

    expect(env.hasTwitchEnv()).toBe(true);
    expect(env.twitchEnv()).toEqual(TWITCH);
  });
});
