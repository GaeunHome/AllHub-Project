import "server-only";
import { db } from "../db";
import { coreUsers } from "../db/schema";
import { hashPassword, newPasswordProblem, normalizeUsername, usernameProblem } from "./credentials";
import { consumeInvite, isInviteToken } from "./invites";

/** 邀請碼不對、過期、撤銷、用完都用這一句：不讓拿著舊連結的人分辨是哪一種 */
export const INVITE_INVALID_MESSAGE = "邀請連結無效、已過期或已用完，請向站長索取新的連結";

export type RegisterInput = { code: string; username: string; password: string; confirmPassword: string };
export type RegisterResult = { ok: true; id: string; sessionVersion: number } | { ok: false; reason: "invalid" | "invite" | "taken"; error: string };

const INVITE_INVALID: RegisterResult = { ok: false, reason: "invite", error: INVITE_INVALID_MESSAGE };

class UsernameTaken extends Error {}

/** 只能用有效的邀請註冊，建立的一律是一般成員；邀請次數與帳號在同一個交易裡，帳號建不起來時次數也退回 */
export async function registerMember({ code, username: input, password, confirmPassword }: RegisterInput, now = new Date()): Promise<RegisterResult> {
  const username = normalizeUsername(input);
  const problem = usernameProblem(username) ?? (password !== confirmPassword ? "兩次輸入的密碼不一樣" : newPasswordProblem(password, username));
  if (problem) return { ok: false, reason: "invalid", error: problem };
  if (!isInviteToken(code)) return INVITE_INVALID;

  // scrypt 要花一點時間，先算好再開交易，不讓邀請那一列被鎖著等
  const passwordHash = await hashPassword(password);
  try {
    return await db().transaction(async (tx): Promise<RegisterResult> => {
      // 先用掉邀請再建帳號：沒有有效邀請的人看不到「帳號已經有人使用」，不能拿註冊頁查帳號
      if ((await consumeInvite(code, now, tx)) === null) return INVITE_INVALID;
      const [user] = await tx
        .insert(coreUsers)
        .values({ username, passwordHash, role: "member" })
        .onConflictDoNothing({ target: coreUsers.username })
        .returning({ id: coreUsers.id, sessionVersion: coreUsers.sessionVersion });
      // 丟出去讓整個交易取消，剛才用掉的邀請次數一起退回
      if (!user) throw new UsernameTaken();
      return { ok: true, id: user.id, sessionVersion: user.sessionVersion };
    });
  } catch (error) {
    if (error instanceof UsernameTaken) return { ok: false, reason: "taken", error: "這個帳號已經有人使用，請換一個" };
    throw error;
  }
}
