import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { Avatar, type AvatarSize } from "@/core/ui/avatar";
import { cachedChannelAvatar } from "../../service/cached";

type ChannelAvatarProps = {
  /** 頻道 id 或 @handle */
  channelRef: string;
  name: string;
  /** 追蹤時存下的頭像 可能已經過期 頻道頁讀不到時改用它 */
  stored?: string | null;
  size: AvatarSize;
  className?: string;
};

/** 頻道頁的頭像快取一天 YouTube 慢時先顯示資料庫的頭像或文字頭像 */
export function ChannelAvatar(props: ChannelAvatarProps) {
  const { name, stored = null, size, className } = props;
  return (
    <Suspense fallback={<Avatar src={externalAssetUrl(stored)} name={name} size={size} className={className} />}>
      <FetchedAvatar {...props} />
    </Suspense>
  );
}

async function FetchedAvatar({ channelRef, name, stored = null, size, className }: ChannelAvatarProps) {
  await requireSession();
  const fetched = await cachedChannelAvatar(channelRef);
  return <Avatar src={externalAssetUrl(fetched ?? stored)} name={name} size={size} className={className} />;
}
