import { charLength, tidyText } from "../text";

// 暱稱的整理 長度與顯示 存檔與畫面共用

const NICKNAME_MAX_LENGTH = 20;

/** 清空就回到 null 顯示時改用帳號名稱 */
export function normalizeNickname(raw: string): string | null {
  const nickname = tidyText(raw);
  return nickname === "" ? null : nickname;
}

export function nicknameProblem(nickname: string | null): string | null {
  return nickname !== null && charLength(nickname) > NICKNAME_MAX_LENGTH ? `暱稱最多 ${NICKNAME_MAX_LENGTH} 個字` : null;
}

/** 看得到自己名字的地方用這個 登入一律用帳號名稱 */
export const displayNameOf = ({ nickname, username }: { nickname: string | null; username: string }): string => nickname ?? username;
