import { cache, type ReactNode } from "react";
import { requireSession } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { Avatar } from "@/core/ui/avatar";
import { Icon } from "@/core/ui/icon";
import { Skeleton } from "@/core/ui/skeleton";
import { youtubeChannelRef, youtubeChannelUrl } from "../../lib/urls";
import { cachedChannelAvatar, cachedFollowedVideo, cachedSavedVideos, cachedVideoInfo } from "../../service/cached";
import { WatchSaveButton } from "./save-video-button";

type WatchMeta = { title: string | null; channel: { name: string; url: string | null; avatar: string | null } | null };

/**
 * 自己追蹤頻道的影片從資料庫找 其他用 oEmbed 補上頻道與標題
 * 標題與頻道列各自串流 cache 讓兩邊共用同一次查詢
 */
const watchMeta = cache(async (userId: string, videoId: string): Promise<WatchMeta> => {
  const tracked = await cachedFollowedVideo(userId, videoId);
  if (tracked) {
    const avatar = await cachedChannelAvatar(tracked.channelId);
    return {
      title: null,
      channel: { name: tracked.channelTitle ?? tracked.channelId, url: youtubeChannelUrl(tracked.channelId), avatar: avatar ?? tracked.thumbnail },
    };
  }

  const info = await cachedVideoInfo(videoId);
  const ref = info?.channelUrl ? youtubeChannelRef(info.channelUrl) : null;
  const avatar = ref ? await cachedChannelAvatar(ref) : null;
  return { title: info?.title ?? null, channel: info?.channelName ? { name: info.channelName, url: info.channelUrl ?? null, avatar } : null };
});

/** 照 YouTube 觀看頁放在播放器下方 最多兩行 */
export function WatchTitleText({ title }: { title: string }) {
  return (
    <h1 title={title} className="line-clamp-2 text-lg leading-snug font-bold text-ink sm:text-xl">
      {title}
    </h1>
  );
}

export async function WatchTitle({ videoId, title }: { videoId: string; title: string }) {
  const user = await requireSession();
  const meta = await watchMeta(user.id, videoId);
  // 沒翻譯過也不是追蹤中頻道的影片只知道 id 有 oEmbed 的標題就換上
  return <WatchTitleText title={title === videoId && meta.title ? meta.title : title} />;
}

type ChannelIdentityProps = { avatar: ReactNode; name: string | null; url?: string | null; action: ReactNode };

/** 頻道列左半邊放不下時保留按鈕換到下一行 不把頻道名稱擠成一兩個字 */
function ChannelIdentity({ avatar, name, url, action }: ChannelIdentityProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-3">
        {avatar}
        {name && (
          <p className="min-w-0 truncate text-base font-semibold text-ink">
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                {name}
              </a>
            ) : (
              name
            )}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/** 頻道列的左半邊 頭像 頻道名稱與保留按鈕 右半邊是翻譯的膠囊按鈕 */
export async function WatchChannel({ videoId }: { videoId: string }) {
  const user = await requireSession();
  const [{ channel }, saved] = await Promise.all([watchMeta(user.id, videoId), cachedSavedVideos(user.id)]);
  const action = <WatchSaveButton videoId={videoId} saved={saved.some((video) => video.videoId === videoId)} />;
  if (!channel) return <ChannelIdentity avatar={<Avatar src={null} name="?" size="md" />} name={null} action={action} />;
  return (
    <ChannelIdentity avatar={<Avatar src={externalAssetUrl(channel.avatar)} name={channel.name} size="md" />} name={channel.name} url={channel.url} action={action} />
  );
}

/** 頭像讀到前先放一樣大的模組圖示 保留按鈕也先放一樣大的骨架 版面才不會跳 */
export function WatchChannelFallback({ icon }: { icon: `/${string}.svg` }) {
  return (
    <ChannelIdentity
      avatar={<span className="icon-tile size-12 rounded-full"><Icon src={icon} /></span>}
      name={null}
      action={<Skeleton className="h-11 w-[5.5rem] rounded-full" />}
    />
  );
}
