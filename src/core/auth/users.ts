import "server-only";
import { and, asc, eq, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { avatarOf, uploadedAvatar } from "../avatars";
import { db } from "../db";
import { coreAvatarImages, coreUsers, type UserRole } from "../db/schema";
import { userAvatar } from "../db/users";
import { AVATAR_STORED_MAX_BYTES, KEEP_AVATAR, isJpeg } from "./avatar-rules";
import { hashPassword, needsRehash, newPasswordProblem, normalizeUsername, usernameProblem, verifyPassword } from "./credentials";
import { nicknameProblem, normalizeNickname } from "./nickname";
import type { SessionClaims } from "./session";

export type { UserRole } from "../db/schema";
export type SessionUser = { id: string; username: string; nickname: string | null; avatar: string | null; role: UserRole };

/**
 * 每錯 failures 次鎖一次 依序用 minutes 的分鐘數 之後都用最後一個
 * 上限不設太長 知道帳號的人可以故意鎖住別人
 */
export const LOGIN_LOCK = { failures: 5, minutes: [15, 30, 60] } as const;

/** disabled 只在密碼正確時出現 不知道密碼的人分不出帳號存在或停用 */
export type AuthResult = { id: string; sessionVersion: number; disabled?: true };

export type ChangePasswordResult =
  | { ok: true; sessionVersion: number }
  | { ok: false; reason: "wrong_password" | "invalid" | "not_found" | "conflict"; error: string };

export type DeleteAccountResult = { ok: true } | { ok: false; reason: "wrong_password" | "last_owner" | "not_found"; error: string };

export type UpdateNicknameResult = { ok: true; nickname: string | null } | { ok: false; error: string };

export type UpdateAvatarResult = { ok: true; avatar: string | null } | { ok: false; error: string };

const NOT_FOUND_MESSAGE = "找不到這個帳號，請重新登入";

/** 帳號不存在 格式不對或鎖定中都跑一次假驗證 回應時間不透露帳號是否存在 */
export async function authenticate(usernameInput: string, password: string, now = new Date()): Promise<AuthResult | null> {
  const username = normalizeUsername(usernameInput);
  const user = usernameProblem(username) ? undefined : await reserveLoginAttempt(username, now);
  if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) return null;

  await db().update(coreUsers).set({ failedLogins: 0, lockedUntil: null }).where(eq(coreUsers.id, user.id));
  if (needsRehash(user.passwordHash)) {
    // 雜湊沒被改過才寫回 別處剛改的密碼不能被舊密碼蓋回去
    // 不遞增版本 其他裝置不受影響
    await db()
      .update(coreUsers)
      .set({ passwordHash: await hashPassword(password) })
      .where(and(eq(coreUsers.id, user.id), eq(coreUsers.passwordHash, user.passwordHash)));
  }
  return user.disabledAt ? { id: user.id, sessionVersion: user.sessionVersion, disabled: true } : { id: user.id, sessionVersion: user.sessionVersion };
}

/**
 * 先把這次算成失敗再驗證密碼 成功才歸零
 * 同時送出很多請求也只有鎖定前的幾次拿得到雜湊 不能趁計數還沒寫入多猜
 */
async function reserveLoginAttempt(username: string, now: Date) {
  const next = sql`(${coreUsers.failedLogins} + 1)`;
  const [user] = await db()
    .update(coreUsers)
    .set({ failedLogins: next, lockedUntil: lockedUntilAfter(next, now) })
    .where(and(eq(coreUsers.username, username), or(isNull(coreUsers.lockedUntil), lte(coreUsers.lockedUntil, now))))
    .returning({ id: coreUsers.id, passwordHash: coreUsers.passwordHash, sessionVersion: coreUsers.sessionVersion, disabledAt: coreUsers.disabledAt });
  return user;
}

/**
 * 在同一個 update 裡算鎖定時間 不必先讀再寫
 * 常數直接寫進 SQL 參數型別才不會被推成 numeric 變成小數除法
 */
function lockedUntilAfter(count: SQL, now: Date): SQL {
  const { failures, minutes } = LOGIN_LOCK;
  const lockFor = (mins: number) => sql`${now.toISOString()}::timestamptz + make_interval(mins => ${sql.raw(String(mins))})`;
  const steps = minutes.slice(0, -1).map((mins, i) => sql`when ${count} = ${sql.raw(String(failures * (i + 1)))} then ${lockFor(mins)}`);
  return sql`case when ${count} % ${sql.raw(String(failures))} <> 0 then ${coreUsers.lockedUntil} ${sql.join(steps, sql` `)} else ${lockFor(minutes[minutes.length - 1])} end`;
}

/** 停用的帳號也查不到 站長停用後簽章仍有效的 cookie 立刻失效 */
export async function findSessionUser({ userId, version }: SessionClaims): Promise<SessionUser | null> {
  const [user] = await db()
    // 每個請求都會走到這裡 新程式比 migration 先上線時欄位還不存在 從整列取值才不會全站登入失敗
    .select({ id: coreUsers.id, username: coreUsers.username, nickname: sql<string | null>`to_jsonb(${coreUsers}) ->> 'nickname'`, avatar: userAvatar, role: coreUsers.role })
    .from(coreUsers)
    .where(and(eq(coreUsers.id, userId), eq(coreUsers.sessionVersion, version), isNull(coreUsers.disabledAt)));
  return user ?? null;
}

export async function hasAnyUser(): Promise<boolean> {
  const rows = await db().select({ id: coreUsers.id }).from(coreUsers).limit(1);
  return rows.length > 0;
}

/**
 * 成功時 session 版本遞增 其他裝置的 cookie 立刻失效
 * 呼叫端要用回傳的新版本重發這台裝置的 cookie
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  const problem = newPasswordProblem(newPassword);
  if (problem) return { ok: false, reason: "invalid", error: problem };

  const [user] = await db().select().from(coreUsers).where(eq(coreUsers.id, userId));
  if (!(await verifyPassword(currentPassword, user?.passwordHash ?? null)) || !user) {
    return user ? { ok: false, reason: "wrong_password", error: "目前的密碼不正確" } : { ok: false, reason: "not_found", error: NOT_FOUND_MESSAGE };
  }
  if (newPassword.normalize("NFKC") === currentPassword.normalize("NFKC")) return { ok: false, reason: "invalid", error: "新密碼不能跟目前的密碼一樣" };

  const [updated] = await db()
    .update(coreUsers)
    .set({ passwordHash: await hashPassword(newPassword), sessionVersion: sql`${coreUsers.sessionVersion} + 1`, updatedAt: new Date() })
    // 驗證完到寫入之間密碼若被別處改掉 就不覆蓋
    .where(and(eq(coreUsers.id, userId), eq(coreUsers.passwordHash, user.passwordHash)))
    .returning({ sessionVersion: coreUsers.sessionVersion });
  if (!updated) return { ok: false, reason: "conflict", error: "密碼剛被變更過，請重新登入後再試" };
  return { ok: true, sessionVersion: updated.sessionVersion };
}

/** 只是顯示用的名字 帳號名稱 登入與 session 都不受影響 所以不用密碼 userId 一律來自 session */
export async function updateNickname(userId: string, input: string): Promise<UpdateNicknameResult> {
  const nickname = normalizeNickname(input);
  const problem = nicknameProblem(nickname);
  if (problem) return { ok: false, error: problem };
  const rows = await db().update(coreUsers).set({ nickname, updatedAt: new Date() }).where(eq(coreUsers.id, userId)).returning({ id: coreUsers.id });
  return rows.length > 0 ? { ok: true, nickname } : { ok: false, error: NOT_FOUND_MESSAGE };
}

/**
 * 空字串是改回文字頭像 範例頭像只存 id 換一張就是蓋掉舊的 userId 一律來自 session
 * 改成別的頭像時上傳的照片一起刪 不留在資料庫佔空間 KEEP_AVATAR 是留著目前的照片
 */
export async function updateAvatar(userId: string, input: string): Promise<UpdateAvatarResult> {
  if (input === KEEP_AVATAR) return { ok: true, avatar: input };
  const avatar = avatarOf(input);
  if (input !== "" && avatar === null) return { ok: false, error: "找不到這個頭像，請重新整理頁面" };
  const rows = await db().transaction(async (tx) => {
    await tx.delete(coreAvatarImages).where(eq(coreAvatarImages.userId, userId));
    return tx.update(coreUsers).set({ avatar, updatedAt: new Date() }).where(eq(coreUsers.id, userId)).returning({ id: coreUsers.id });
  });
  return rows.length > 0 ? { ok: true, avatar } : { ok: false, error: NOT_FOUND_MESSAGE };
}

/** 瀏覽器已經裁好縮好 這裡再看一次內容與大小 Server Action 可以被直接 POST */
export async function saveUploadedAvatar(userId: string, image: Buffer): Promise<UpdateAvatarResult> {
  if (image.length > AVATAR_STORED_MAX_BYTES || !isJpeg(image)) return { ok: false, error: "這張照片不能用，請換一張" };
  const avatar = await db().transaction(async (tx) => {
    // 先刪再新增 id 換新 網址跟著換 瀏覽器才不會留著舊圖
    await tx.delete(coreAvatarImages).where(eq(coreAvatarImages.userId, userId));
    const [row] = await tx.insert(coreAvatarImages).values({ userId, image }).returning({ id: coreAvatarImages.id });
    const value = uploadedAvatar(row.id);
    await tx.update(coreUsers).set({ avatar: value, updatedAt: new Date() }).where(eq(coreUsers.id, userId));
    return value;
  });
  return { ok: true, avatar };
}

export async function readAvatarImage(id: string): Promise<Buffer | null> {
  const [row] = await db().select({ image: coreAvatarImages.image }).from(coreAvatarImages).where(eq(coreAvatarImages.id, id));
  return row?.image ?? null;
}

/**
 * 要再輸入密碼 偷到 cookie 的人才不能直接刪掉帳號
 * 最後一個未停用的站長不能刪除自己 否則沒人能管理
 */
export async function deleteOwnAccount(userId: string, password: string): Promise<DeleteAccountResult> {
  const [user] = await db().select({ passwordHash: coreUsers.passwordHash }).from(coreUsers).where(eq(coreUsers.id, userId));
  if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) {
    return user ? { ok: false, reason: "wrong_password", error: "密碼不正確" } : { ok: false, reason: "not_found", error: NOT_FOUND_MESSAGE };
  }

  return db().transaction(async (tx): Promise<DeleteAccountResult> => {
    // 依 id 順序鎖住所有站長 兩個站長同時刪除自己時
    // 後一個要等前一個完成 才看得到真正剩下幾個
    const owners = await tx
      .select({ id: coreUsers.id, disabledAt: coreUsers.disabledAt })
      .from(coreUsers)
      .where(eq(coreUsers.role, "owner"))
      .orderBy(asc(coreUsers.id))
      .for("update");
    const isOwner = owners.some((owner) => owner.id === userId);
    if (isOwner && !owners.some((owner) => owner.id !== userId && owner.disabledAt === null)) {
      return { ok: false, reason: "last_owner", error: "你是唯一的站長，不能刪除自己的帳號" };
    }
    // 邀請 通知與各模組依使用者的資料靠外鍵 cascade 一起刪
    // 共用的翻譯只把發起人改成 null
    const deleted = await tx.delete(coreUsers).where(eq(coreUsers.id, userId)).returning({ id: coreUsers.id });
    return deleted.length > 0 ? { ok: true } : { ok: false, reason: "not_found", error: NOT_FOUND_MESSAGE };
  });
}
