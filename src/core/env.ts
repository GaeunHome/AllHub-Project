import "server-only";
import { z } from "zod";

// 所有環境變數都定義在這裡，分組與順序跟 .env.example 一致；各組用到時才驗證，沒用到的模組不必填

const aesKey = z.base64("必須是 base64").refine((v) => Buffer.from(v, "base64").length === 32, "必須是 32 bytes（openssl rand -base64 32）");
const publicBaseUrl = z.url();

// ---------- 核心 ----------
export const coreEnv = defineEnv(
  "核心",
  z.object({
    DATABASE_URL: z.url(),
    // 本機 PGlite（npm run db:local）多條連線同時查詢偶爾會出錯，要設成 1
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET 至少 32 個字元"),
    ENCRYPTION_KEY: aesKey,
    CRON_SECRET: z.string().min(16, "CRON_SECRET 至少 16 個字元"),
    // 換金鑰後舊資料只能用舊金鑰解開，重新加密完成前要留著；可以有多把
    ENCRYPTION_KEY_PREVIOUS: z
      .string()
      .optional()
      .transform((v) => (v ?? "").split(",").map((key) => key.trim()).filter(Boolean))
      .pipe(z.array(aesKey)),
  }),
);

// ---------- Twitch 模組 ----------
const twitchSchema = z.object({
  TWITCH_CLIENT_ID: z.string().min(1),
  TWITCH_CLIENT_SECRET: z.string().min(1),
  // Twitch 規定 EventSub secret 長度 10–100
  TWITCH_EVENTSUB_SECRET: z.string().min(10).max(100),
  PUBLIC_BASE_URL: publicBaseUrl,
});
export const twitchEnv = defineEnv("Twitch 模組", twitchSchema);
/** 缺少或格式不對的變數名稱（照上面的順序，不含值）：加主播時直接告訴使用者要設定哪幾個 */
export function missingTwitchEnv(): string[] {
  const result = twitchSchema.safeParse(envSource());
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
}
// 頭像與直播預覽在還沒設定憑證時要照常顯示（退回文字頭像），所以另外提供不丟錯的檢查，條件跟 twitchEnv() 相同
export const hasTwitchEnv = () => missingTwitchEnv().length === 0;

// ---------- YouTube 模組 ----------
export const youtubeEnv = defineEnv(
  "YouTube 模組",
  z.object({
    PUBLIC_BASE_URL: publicBaseUrl,
    // WebSub 規定 hub.secret 少於 200 bytes
    YOUTUBE_WEBSUB_SECRET: z.string().min(16, "YOUTUBE_WEBSUB_SECRET 至少 16 個字元").max(199),
  }),
);

// ---------- 本機測試（選填，production 會忽略） ----------
const devSchema = z.object({
  DEV_EXTERNAL_ORIGIN: z.url().optional(),
  // 固定登入與註冊的圖形驗證碼，給 E2E 用；字元跟 core/auth/captcha-image.ts 的 CAPTCHA_ALPHABET 一致（字型只畫得出這些字）
  DEV_CAPTCHA_CODE: z
    .string()
    .regex(/^[ACDEFHJKMNPRTUVWXY34679]{5}$/, "要剛好 5 個驗證碼用的字元（大寫英文與數字，不含容易看錯的字）")
    .optional(),
});

// 不快取：production 不會讀，開發與測試時每次重讀才能隨時切換假伺服器
export const devEnv = () => parseEnv(devSchema, "本機測試");

function defineEnv<T extends z.ZodType>(scope: string, schema: T): () => z.output<T> {
  let cached: z.output<T> | undefined;
  return () => (cached ??= parseEnv(schema, scope));
}

// .env 裡留空（KEY=）當成沒設定，選填的變數才不會因為空字串驗證失敗
const envSource = () => Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));

function parseEnv<T extends z.ZodType>(schema: T, scope: string): z.output<T> {
  const source = envSource();
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  // 只列變數名稱與原因、不帶值：這個錯誤會進 log，值可能是密鑰
  const issues = result.error.issues.map((issue) => {
    const reason = source[String(issue.path[0])] === undefined ? "未設定" : issue.message;
    return `  - ${issue.path.join(".")}：${reason}`;
  });
  throw new Error(`${scope}環境變數設定有誤（請檢查 .env.local）：\n${issues.join("\n")}`);
}
