import "server-only";
import { createHash } from "node:crypto";
import { claimOnce, releaseOnce } from "./auth/attempts";
import { logError } from "./errors";

// 排程寄的提醒同一件事只寄一次 先認領再寄 寄不出去就放掉 下一輪再試

/** 認領用的 key 例如帳號與期別 只存 sha256 看不出是誰的哪一期 */
export function claimKey(...parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

/** 放掉認領也失敗時寫的 log 例如 module 是 starrail what 是放掉通知的認領失敗 */
export type ReleaseLog = { module: string; what: string };

/**
 * 自己認領的用這個 例如條件式 update 的 last_notified_on 寄不出去就 release 退回
 * 退回也失敗時只記 log 丟出 send 原本的錯誤 下一輪才認領得到
 */
export async function sendOrRelease<T>(send: () => Promise<T>, release: () => Promise<unknown>, log: ReleaseLog): Promise<T> {
  try {
    return await send();
  } catch (error) {
    try {
      await release();
    } catch (releaseError) {
      logError(log.module, log.what, releaseError);
    }
    throw error;
  }
}

/** scope 照 claimOnce 的慣例 模組 id 加冒號再加種類 例如 starrail:daily */
export type OnceOptions = { scope: string; now: Date; log: ReleaseLog };

/**
 * 用 claimOnce 認領 認領到才做 send 回傳有沒有做 寄不出去就放掉並丟出原本的錯誤
 * 認領的紀錄一天後清掉 只擋得住一天內的重複 週期要短於一天
 */
export async function sendOnce({ scope, key, now, log }: OnceOptions & { key: string }, send: () => Promise<void>): Promise<boolean> {
  if (!(await claimOnce(scope, key, now))) return false;
  await sendOrRelease(send, () => releaseOnce(scope, key), log);
  return true;
}

/** sent 寄出 already 這一輪之前就認領過 failed 是出錯時還沒寄到的 */
export type OnceBatch<T> = { sent: T[]; already: T[]; failed: T[] } & ({ ok: true } | { ok: false; error: unknown });

/**
 * 一批各自認領 認領到的一起寄一次 例如同一縣市的人 出錯時放掉這次認領到的 放不掉只記 log
 * 不丟出錯誤 錯誤放在結果裡 呼叫端才算得出寄了幾則 幾則寄不出去
 */
export async function sendOnceEach<T>({ scope, now, log }: OnceOptions, items: readonly T[], keyOf: (item: T) => string, send: (claimed: T[]) => Promise<void>): Promise<OnceBatch<T>> {
  const claimed: T[] = [];
  const alreadyAt = new Set<number>();
  const already = () => items.filter((_, index) => alreadyAt.has(index));
  try {
    for (const [index, item] of items.entries()) {
      if (await claimOnce(scope, keyOf(item), now)) claimed.push(item);
      else alreadyAt.add(index);
    }
    if (claimed.length > 0) await send(claimed);
    return { ok: true, sent: claimed, already: already(), failed: [] };
  } catch (error) {
    for (const item of claimed) {
      try {
        await releaseOnce(scope, keyOf(item));
      } catch (releaseError) {
        logError(log.module, log.what, releaseError);
      }
    }
    return { ok: false, error, sent: [], already: already(), failed: items.filter((_, index) => !alreadyAt.has(index)) };
  }
}
