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
