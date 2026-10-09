import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // 快取效期；規則見 CLAUDE.md「快取」。stale 是瀏覽器端的保留時間，低於 5 分鐘才不會被放進預先抓取的 App Shell
  cacheLife: {
    // 資料庫讀取：每個寫入點都會讓 tag 失效，時間只是保險（直接改資料庫時最多一天會自己更新）
    db: { stale: 30, revalidate: 3600, expire: 86_400 },
    // 外部即時資料（HoYoLAB 即時便箋）：畫面上的資料最多 5 分鐘前
    external: { stale: 30, revalidate: 60, expire: 300 },
    // 直播狀態（Twitch 直播中、觀看人數、預覽圖）：最多 2 分鐘前
    live: { stale: 30, revalidate: 60, expire: 120 },
    // 很少變的外部資料（頭像、離線橫幅、遊戲封面、頻道頭像、影片資訊）：最多一天前
    avatar: { stale: 30, revalidate: 43_200, expire: 86_400 },
    // HoYoLAB 戰績類資料（角色、開拓月曆、終局戰績）：最多 30 分鐘前
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
