import type { CSSProperties } from "react";

const SIZES = { sm: "size-9 text-sm", md: "size-12 text-lg", lg: "size-20 text-3xl" } as const;

/** 同一個帳號永遠同一組顏色 色相平均散開 */
export function avatarHue(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return hash;
}

/** 站內帳號沒有頭像圖 用帳號名稱決定顏色 暱稱改了顏色也不變 */
export function UserAvatar({ username, name, size }: { username: string; name: string; size: keyof typeof SIZES }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span aria-hidden style={{ "--avatar-hue": avatarHue(username) } as CSSProperties} className={`user-avatar ${SIZES[size]}`}>
      {initial}
    </span>
  );
}
