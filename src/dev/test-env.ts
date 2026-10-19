import { vi } from "vitest";

// env.ts 會快取驗證結果 stub 系列要在 await import 被測模組之前呼叫

export const TEST_CORE_ENV = {
  DATABASE_URL: "postgresql://unused@127.0.0.1:1/x",
  SESSION_SECRET: "s".repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  CRON_SECRET: "c".repeat(16),
};

export const TEST_TWITCH_ENV = {
  TWITCH_CLIENT_ID: "client-id",
  TWITCH_CLIENT_SECRET: "client-secret",
  TWITCH_EVENTSUB_SECRET: "eventsub-secret-123",
  PUBLIC_BASE_URL: "https://hub.example.com",
};

export const TEST_YOUTUBE_ENV = {
  PUBLIC_BASE_URL: "https://hub.example.com",
  YOUTUBE_WEBSUB_SECRET: "websub-secret-for-tests-123",
};

export const TEST_WEATHER_ENV = {
  CWA_API_KEY: "CWA-TEST-KEY-1234",
  MOENV_API_KEY: "moenv-test-key-5678",
};

type CoreOverrides = Partial<Record<keyof typeof TEST_CORE_ENV | "ENCRYPTION_KEY_PREVIOUS", string>>;

function stubAll<T extends Record<string, string>>(vars: T): T {
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  return vars;
}

/** 資料庫 session 加密 排程密鑰這些核心設定 回傳實際設定的值 */
export const stubCoreEnv = (overrides: CoreOverrides = {}) => stubAll({ ...TEST_CORE_ENV, ...overrides });

export const stubTwitchEnv = (overrides: Partial<typeof TEST_TWITCH_ENV> = {}) => stubAll({ ...TEST_TWITCH_ENV, ...overrides });

export const stubYoutubeEnv = (overrides: Partial<typeof TEST_YOUTUBE_ENV> = {}) => stubAll({ ...TEST_YOUTUBE_ENV, ...overrides });

export const stubWeatherEnv = (overrides: Partial<typeof TEST_WEATHER_ENV> = {}) => stubAll({ ...TEST_WEATHER_ENV, ...overrides });

/** 跨模組的測試一次設好核心與每個模組 新模組的設定也要加進來 */
export const stubAllEnv = () => ({ ...stubCoreEnv(), ...stubTwitchEnv(), ...stubYoutubeEnv(), ...stubWeatherEnv() });
