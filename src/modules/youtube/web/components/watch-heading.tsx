import { cache, type ReactNode } from "react";
import { requireSession } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { Avatar } from "@/core/ui/avatar";
import { Icon } from "@/core/ui/icon";
import { youtubeChannelRef } from "../../lib/urls";
import { cachedChannelAvatar, cachedVideoChannel, cachedVideoInfo } from "../../service/cached";

type WatchMeta = { title: string | null; channel: { name: string; url: string | null; avatar: string | null } | null };

/** 自己追蹤的頻道的影片從資料庫找頻道；其他影片用 oEmbed 補上頻道與標題（外部資料都只放快取）；標題與頻道列各自串流，cache 讓兩邊共用同一次查詢 */
const watchMeta = cache(async (userId: string, videoId: string): Promise<WatchMeta> => {
  const tracked = await cachedVideoChannel(userId, videoId);
  if (tracked) {
    const avatar = await cachedChannelAvatar(tracked.channelId);
    return {
      title: null,
      channel: { name: tracked.channelTitle ?? tracked.channelId, url: `https://www.youtube.com/channel/${tracked.channelId}`, avatar: avatar ?? tracked.thumbnail },
    };
  }

  const info = await cachedVideoInfo(videoId);
  const ref = info?.channelUrl ? youtubeChannelRef(info.channelUrl) : null;
  const avatar = ref ? await cachedChannelAvatar(ref) : null;
  return { title: info?.title ?? null, channel: info?.channelName ? { name: info.channelName, url: info.channelUrl ?? null, avatar } : null };
});

/** 播放器下方的標題（YouTube 觀看頁的排法）：最多兩行 */
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
  // 還沒翻譯過、也不是追蹤中頻道的影片只知道 id，有 oEmbed 的標題就換上
  return <WatchTitleText title={title === videoId && meta.title ? meta.title : title} />;
}

function ChannelIdentity({ avatar, name, url }: { avatar: ReactNode; name: string | null; url?: string | null }) {
  return (
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
  );
}

/** 標題下方的頻道列左半邊：頭像與頻道名稱（右半邊是翻譯的膠囊按鈕） */
export async function WatchChannel({ videoId }: { videoId: string }) {
  const user = await requireSession();
  const { channel } = await watchMeta(user.id, videoId);
  if (!channel) return <ChannelIdentity avatar={<Avatar src={null} name="?" size="md" />} name={null} />;
  return <ChannelIdentity avatar={<Avatar src={externalAssetUrl(channel.avatar)} name={channel.name} size="md" />} name={channel.name} url={channel.url} />;
}

/** 頭像還沒讀到前先放模組圖示，大小跟頭像一樣，載入前後版面不會跳 */
export function WatchChannelFallback({ icon }: { icon?: `/${string}.svg` }) {
  return (
    <ChannelIdentity
      avatar={<span className="icon-tile size-12 rounded-full">{icon ? <Icon src={icon} /> : <Icon name="play" />}</span>}
      name={null}
    />
  );
}
