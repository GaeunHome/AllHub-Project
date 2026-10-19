import { vi } from "vitest";
import type { DailyNote, GameRole } from "../lib/responses";
import type { StarrailAccount } from "../data/schema";

// 星穹鐵道的測試共用的假資料 只有測試可以 import

/** 連結只要這兩個鍵 斷言時看 v2_secret 有沒有出現在不該出現的地方 */
export const COOKIE = "ltoken_v2=v2_secret_token; ltuid_v2=42";

/** HoYoLAB 查到的角色 預設是台港澳服 70 級的開拓者 */
export const role = (overrides: Partial<GameRole> = {}): GameRole => ({ uid: "900000001", nickname: "開拓者", region: "prod_official_cht", regionName: null, level: 70, ...overrides });

export const ROLE = role();

/** HoYoLAB 讀得到時的結果 */
export const ok = <T>(data: T) => ({ ok: true as const, data });

/**
 * 即時便箋 開拓力 100/300 到不了預設門檻 280
 * 每日實訓 模擬宇宙積分與歷戰餘響都還沒做完 提醒的時段到了就會提醒
 */
export const dailyNote = (overrides: Partial<DailyNote> = {}): DailyNote => ({
  stamina: 100,
  maxStamina: 300,
  staminaRecoverSeconds: 72_000,
  reserveStamina: 0,
  expeditionsAccepted: 4,
  expeditionsTotal: 4,
  trainScore: 300,
  maxTrainScore: 500,
  rogueScore: 8000,
  maxRogueScore: 14000,
  cocoonRemaining: 2,
  cocoonLimit: 3,
  ...overrides,
});

/** 頁面拿到的帳號 欄位跟 service 的 StarrailAccountView 一樣 不含 cookie */
type AccountView = Pick<StarrailAccount, "id" | "uid" | "nickname" | "region" | "level" | "staminaAlertThreshold" | "cookieInvalid" | "autoRedeem" | "gameReminders"> & { canAutoRedeem: boolean };

export const accountView = (overrides: Partial<AccountView> = {}): AccountView => ({
  id: 3,
  uid: "900000003",
  nickname: "開拓者",
  region: "prod_official_cht",
  level: 70,
  staminaAlertThreshold: null,
  cookieInvalid: false,
  autoRedeem: false,
  canAutoRedeem: false,
  gameReminders: true,
  ...overrides,
});

/**
 * lib/hoyolab 的替身 每個對外的函式都是 vi.fn 沒設定回應的只會拿到 undefined 不會連到真的 HoYoLAB
 * 用法 vi.mock("../lib/hoyolab", async () => (await import("../dev/fixtures")).hoyolab)
 */
export const hoyolab = {
  fetchGameRoles: vi.fn(),
  fetchDailyNote: vi.fn(),
  fetchCharacters: vi.fn(),
  fetchProfile: vi.fn(),
  fetchActCalendar: vi.fn(),
  fetchLedger: vi.fn(),
  fetchEndgame: vi.fn(),
  redeemCode: vi.fn(),
  fetchCheckinInfo: vi.fn(),
  signIn: vi.fn(),
};
