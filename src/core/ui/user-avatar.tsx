import Image from "next/image";
import type { CSSProperties } from "react";
import { avatarUrl } from "../avatars";

const SIZES = {
  xs: { box: "size-7 text-xs", px: 28 },
  sm: { box: "size-9 text-sm", px: 36 },
  md: { box: "size-12 text-lg", px: 48 },
  lg: { box: "size-20 text-3xl", px: 80 },
} as const;

/** 同一個帳號永遠同一組顏色 色相平均散開 */
function avatarHue(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return hash;
}

type UserAvatarProps = { username: string; name: string; size: keyof typeof SIZES; avatar?: string | null };

/** 選了範例頭像或上傳了照片就畫圖 沒有時顏色跟著帳號名稱 暱稱改了顏色也不變 */
export function UserAvatar({ username, name, size, avatar }: UserAvatarProps) {
  const picture = avatarUrl(avatar);
  const { box, px } = SIZES[size];
  if (picture) return <Image src={picture} alt="" width={px} height={px} unoptimized className={`user-avatar-image ${box}`} />;
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span aria-hidden style={{ "--avatar-hue": avatarHue(username) } as CSSProperties} className={`user-avatar ${box}`}>
      {initial}
    </span>
  );
}
