import { Suspense, type ReactNode } from "react";
import { requireSession } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { Avatar, type AvatarSize } from "@/core/ui/avatar";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedProfile } from "../../service/cached";

type AccountAvatarProps = {
  account: StarrailAccountView;
  size: AvatarSize;
  /** 頭像還在讀或讀不到時的列車圖示 跟頭像一樣大 */
  placeholder: ReactNode;
  className?: string;
};

/** 遊戲裡的頭像 HoYoLAB 慢的時候先放列車圖示 不擋住名牌的其他部分 */
export function AccountAvatar(props: AccountAvatarProps) {
  return (
    <Suspense fallback={props.placeholder}>
      <LoadedAccountAvatar {...props} />
    </Suspense>
  );
}

/** 頭像快取一天 讀不到時維持列車圖示 帳號的 cookie 失效標記不在這裡動 */
export async function LoadedAccountAvatar({ account, size, placeholder, className }: AccountAvatarProps) {
  const user = await requireSession();
  const src = externalAssetUrl(await cachedProfile(user.id, account.id));
  if (!src) return placeholder;
  return <Avatar src={src} name={account.nickname ?? "開拓者"} size={size} className={className} />;
}
