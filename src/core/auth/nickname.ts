// 暱稱的整理 長度與顯示 存檔與畫面共用

const NICKNAME_MAX_LENGTH = 20;

/** 清空就回到 null 顯示時改用帳號名稱 */
export function normalizeNickname(raw: string): string | null {
  const nickname = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  return nickname === "" ? null : nickname;
}

export function nicknameProblem(nickname: string | null): string | null {
  // 用 code point 算字數 emoji 才不會算成兩個字
  return nickname !== null && [...nickname].length > NICKNAME_MAX_LENGTH ? `暱稱最多 ${NICKNAME_MAX_LENGTH} 個字` : null;
}

/** 看得到自己名字的地方用這個 登入一律用帳號名稱 */
export const displayNameOf = ({ nickname, username }: { nickname: string | null; username: string }): string => nickname ?? username;
