"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/core/ui/icon";
import { matchesQuery } from "../saved-filter";

/** text 是篩選用的標題與頻道名稱 card 由伺服器算繪好傳進來 */
export type SavedItem = { id: string; text: string; card: ReactNode };

/** 最多 15 部 搜尋只在瀏覽器裡篩選 不必再問伺服器 */
export function SavedVideoList({ items, limit }: { items: SavedItem[]; limit: number }) {
  const [query, setQuery] = useState("");
  const shown = items.filter((item) => matchesQuery(item.text, query));

  return (
    <div className="stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="relative min-w-0 flex-1 basis-64 sm:max-w-md">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            enterKeyHint="search"
            aria-label="搜尋已保留的影片"
            placeholder="搜尋標題或頻道"
            className="input pl-10"
          />
        </div>
        {/* 滿了用提醒的顏色 再保留會擠掉最舊的翻譯過 都是手動保留的就要先移除 */}
        <span className={items.length >= limit ? "chip chip-warning tabular-nums" : "chip tabular-nums"}>
          已保留 {items.length}／{limit}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="yt-box text-center break-words text-ink-soft">找不到標題或頻道含有「{query.trim()}」的影片</p>
      ) : (
        // 這頁沒有側欄 每個寬度都比列表頁多一欄 卡片才一樣大
        <ul className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {shown.map((item) => (
            <li key={item.id}>{item.card}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
