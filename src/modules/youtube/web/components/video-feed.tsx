"use client";

import { useState, type ReactNode } from "react";
import { VIDEO_FILTERS, type VideoFilter } from "../video-filter";

export type FeedItem = { id: string; filters: VideoFilter[]; card: ReactNode };

/** 篩選膠囊與影片格子：卡片由伺服器算繪好傳進來，這裡只決定要顯示哪些，切換時不必再問伺服器 */
export function VideoFeed({ items }: { items: FeedItem[] }) {
  const [filter, setFilter] = useState<VideoFilter>("all");
  const shown = items.filter((item) => item.filters.includes(filter));
  const label = VIDEO_FILTERS.find((option) => option.id === filter)?.label;

  return (
    <div className="stack min-w-0">
      <div role="group" aria-label="篩選影片" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {VIDEO_FILTERS.map((option) => (
          <button key={option.id} type="button" aria-pressed={option.id === filter} onClick={() => setFilter(option.id)} className="yt-chip">
            {option.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="yt-box text-center text-ink-soft">目前沒有「{label}」的影片</p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
          {shown.map((item) => (
            <li key={item.id}>{item.card}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
