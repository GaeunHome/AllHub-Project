import { requireSession } from "@/core/auth";
import { formatRelativeTime } from "@/core/time";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { parseVideoId } from "../../lib/parse";
import { cachedRecentVideos } from "../../service/cached";
import { upNext } from "../video-filter";
import { VideoLink, VideoThumbnail, channelNameOf } from "./video-card";

/** 觀看頁右側（手機在下方）的「接下來播放」：其他最近的影片，縮圖在左的小卡片 */
export async function UpNext({ params }: { params: Promise<{ videoId: string }> }) {
  const user = await requireSession();
  const current = parseVideoId((await params).videoId) ?? "";
  const videos = upNext(await cachedRecentVideos(user.id), current);
  if (videos.length === 0) return null;
  const now = new Date();

  return (
    <section aria-labelledby="youtube-up-next" className="stack">
      <h2 id="youtube-up-next" className="text-base font-semibold text-ink">
        接下來播放
      </h2>
      <ul className="flex flex-col gap-3">
        {videos.map((video, i) => (
          <li key={video.videoId}>
            <VideoLink video={video} className="group flex gap-3">
              {/* 寬螢幕的欄寬跟著視窗高度變（播放器封頂後多出來的寬度都給這一欄），縮圖用比例寬度才不會只佔左邊一小塊 */}
              <span className="yt-thumb w-40 shrink-0 rounded-lg lg:w-32 xl:w-2/5">
                {/* 寬螢幕上第一支在畫面最上面；播放器是跨網域的 iframe 不算 LCP，常常輪到這張縮圖 */}
                <VideoThumbnail video={video} eager={i === 0} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-sm leading-snug font-semibold text-ink group-hover:underline xl:text-base">{video.title}</span>
                <span className="truncate text-[0.8125rem] text-muted xl:text-sm">{channelNameOf(video)}</span>
                {video.publishedAt && (
                  <time dateTime={video.publishedAt.toISOString()} className="text-[0.8125rem] text-muted xl:text-sm">
                    {formatRelativeTime(video.publishedAt, now)}
                  </time>
                )}
              </span>
            </VideoLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UpNextSkeleton() {
  return (
    <LoadingState label="載入其他影片中…" className="stack">
      <Skeleton className="h-6 w-24" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="aspect-video w-40 shrink-0 rounded-lg lg:w-32 xl:w-2/5" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </LoadingState>
  );
}
