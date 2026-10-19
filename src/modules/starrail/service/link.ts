import "server-only";
import { eq } from "drizzle-orm";
import { encryptSecret } from "@/core/crypto";
import { db } from "@/core/db";
import { missingKeysWarning, parseHoyolabCookie } from "../lib/cookie";
import { fetchGameRoles } from "../lib/hoyolab";
import { defaultRoleSelection, serverLabel } from "../lib/roles";
import { starrailAccounts } from "../data/schema";
import type { Outcome } from "./accounts";

/** 連結時讓使用者選的角色 預設勾等級最高的 */
export type RoleChoice = { uid: string; nickname: string | null; server: string; level: number | null; selected: boolean };

/**
 * ask 只有一個角色就直接連結 好幾個就回傳清單讓使用者選 還不寫入
 * all 全部連結 UID 清單只連結這些
 */
export type RoleSelection = "ask" | "all" | string[];

/**
 * accountId 是剛連結或更新 cookie 的自己那一列 頁面導向它
 * warning 是成功了但要提醒的事 roles 是還要先選伺服器
 */
type LinkOutcome = Outcome<{ message: string; warning?: string; accountId: number }> | { ok: false; error?: never; roles: RoleChoice[] };

/** 選到的 UID 已經是別人的 整批不寫入 */
class UidTakenError extends Error {
  constructor(readonly uid: string) {
    super("UID 已經被其他使用者連結");
  }
}

/**
 * 用 cookie 查出角色 選到的每個角色存一列 同 UID 就更新
 * 兩個步驟之間 cookie 留在瀏覽器的表單裡 伺服器不存
 */
export async function linkAccount(userId: string, rawCookie: string, selection: RoleSelection = "all"): Promise<LinkOutcome> {
  const parsed = parseHoyolabCookie(rawCookie);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const roles = await fetchGameRoles(parsed.cookie);
  if (!roles.ok) return { ok: false, error: roles.message };
  if (roles.data.length === 0) return { ok: false, error: "這個 HoYoLAB 帳號底下沒有星穹鐵道角色" };

  if (selection === "ask" && roles.data.length > 1) {
    const preselected = defaultRoleSelection(roles.data);
    return {
      ok: false,
      roles: roles.data.map((role) => ({
        uid: role.uid,
        nickname: role.nickname,
        server: serverLabel(role.region, role.regionName),
        level: role.level,
        selected: preselected.includes(role.uid),
      })),
    };
  }
  // 只信任 HoYoLAB 查到的角色 表單送來的 UID 只用來挑選 不在這帳號底下的略過
  const chosen = Array.isArray(selection) ? roles.data.filter((role) => selection.includes(role.uid)) : roles.data;
  if (chosen.length === 0) return { ok: false, error: "請至少選一個要連結的帳號" };

  const cookieEncrypted = encryptSecret(parsed.cookie);
  const now = new Date();
  const savedIds: number[] = [];
  try {
    await db().transaction(async (tx) => {
      for (const role of chosen) {
        const values = { userId, ltuid: parsed.ltuid, cookieEncrypted, nickname: role.nickname, region: role.region, level: role.level };
        // 同 UID 只更新自己的列 別人的不動
        const [saved] = await tx
          .insert(starrailAccounts)
          .values({ ...values, uid: role.uid })
          .onConflictDoUpdate({ target: starrailAccounts.uid, set: { ...values, cookieInvalid: false, updatedAt: now }, setWhere: eq(starrailAccounts.userId, userId) })
          .returning({ id: starrailAccounts.id });
        if (!saved) throw new UidTakenError(role.uid);
        savedIds.push(saved.id);
      }
    });
  } catch (error) {
    if (error instanceof UidTakenError) return { ok: false, error: `UID ${error.uid} 已經被其他使用者連結了，同一個遊戲帳號只能連結在一個帳號底下` };
    throw error;
  }
  const message = `已連結 ${chosen.map((r) => `${r.nickname ?? "?"}（${serverLabel(r.region, r.regionName)}，${r.uid}）`).join("、")}`;
  // 只要 ltoken_v2 與 ltuid_v2 就能連結 少了其他建議的鍵時提醒哪些功能可能不能用
  const warning = missingKeysWarning(parsed.missing);
  return { ok: true, message, accountId: savedIds[0], ...(warning ? { warning } : {}) };
}
