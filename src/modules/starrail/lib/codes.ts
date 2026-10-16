import "server-only";
import { logError } from "@/core/errors";
import { externalFetch } from "@/core/external-url";
import { asRecord, number, text } from "./json";
import { normalizeRedeemCode } from "./redeem";

// 社群整理的兌換碼 seriaati 的 hoyo-codes 每小時更新 先用真的帳號試過 只列有效的
// 它的帳號在亞服 只限其他伺服器的碼也可能列出 兌換時會被拒絕
const CODES_URL = "https://hoyo-codes.seria.moe/codes?game=hkrpg";
/** 獎勵是英文的一句話 放進通知前截短 */
const REWARD_LIMIT = 120;
/** 清單太長時只試最新的 排程才跑得完 */
const CODE_LIMIT = 50;
/** 排程要在 60 秒內跑完 兌換佔 30 秒 最後一個請求最多 10 秒 清單只能等 5 秒 */
const LIST_TIMEOUT_MS = 5_000;

export type PublicCode = { code: string; rewards: string | null };

/** 格式不對回 null 新加入的碼排前面 快過期的直播碼先兌換 最多 50 個 */
export function parseActiveCodes(json: unknown): PublicCode[] | null {
  const list = asRecord(json)?.codes;
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  const codes = list.flatMap((item) => {
    const entry = asRecord(item);
    if (!entry || (entry.status !== undefined && entry.status !== "OK")) return [];
    const normalized = normalizeRedeemCode(typeof entry.code === "string" ? entry.code : "");
    if (!normalized.ok || seen.has(normalized.code)) return [];
    seen.add(normalized.code);
    return [{ code: normalized.code, rewards: rewardText(entry.rewards), order: number(entry.id) ?? -1 }];
  });
  return codes
    .sort((a, b) => b.order - a.order)
    .slice(0, CODE_LIMIT)
    .map(({ code, rewards }) => ({ code, rewards }));
}

function rewardText(value: unknown): string | null {
  // 換行變成空白 再去掉其他控制字元
  const reward = text(value)
    ?.replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim();
  if (!reward) return null;
  return [...reward].length > REWARD_LIMIT ? `${[...reward].slice(0, REWARD_LIMIT - 1).join("")}…` : reward;
}

/** 讀不到就回 null 明天再試 */
export async function fetchActiveCodes(): Promise<PublicCode[] | null> {
  try {
    const response = await externalFetch(CODES_URL, { headers: { Accept: "application/json" }, cache: "no-store" }, { timeoutMs: LIST_TIMEOUT_MS });
    if (!response.ok) {
      console.error("[starrail] 讀取兌換碼清單失敗", `HTTP ${response.status}`);
      return null;
    }
    const codes = parseActiveCodes(await response.json());
    if (codes === null) console.error("[starrail] 兌換碼清單的格式和預期不同");
    return codes;
  } catch (error) {
    logError("starrail", "讀取兌換碼清單失敗", error);
    return null;
  }
}
