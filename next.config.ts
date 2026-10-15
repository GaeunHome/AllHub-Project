import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // 快取效期 規則見 CLAUDE.md 的快取
  // stale 是瀏覽器端保留的時間 低於 5 分鐘才不會被放進預先抓取的 App Shell
  cacheLife: {
    // 資料庫的讀取 寫入點都會讓 tag 失效 效期只是保險 直接改資料庫時最多一天更新
    db: { stale: 30, revalidate: 3600, expire: 86_400 },
    // HoYoLAB 即時便箋這類即時資料 最多 5 分鐘前
    // 其他外部資料讀不到時也用這個短效期 幾分鐘後再試
    external: { stale: 30, revalidate: 60, expire: 300 },
    // Twitch 的直播狀態 觀看人數與預覽圖 最多 2 分鐘前
    live: { stale: 30, revalidate: 60, expire: 120 },
    // 頭像 封面 影片資訊這類很少變的外部資料 最多一天前
    avatar: { stale: 30, revalidate: 43_200, expire: 86_400 },
    // HoYoLAB 的角色 開拓月曆 終局戰績 最多 30 分鐘前
    records: { stale: 30, revalidate: 900, expire: 1800 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
