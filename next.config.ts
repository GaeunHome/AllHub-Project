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
    // 台鐵與捷運的即時看板 同一站一分鐘只問 TDX 一次 倒數由瀏覽器自己算
    board: { stale: 5, revalidate: 45, expire: 60 },
    // 高鐵 台鐵與捷運的時刻表 一天內很少變 TDX 免費額度有限
    timetable: { stale: 30, revalidate: 43_200, expire: 86_400 },
    // 頭像 封面 影片資訊這類很少變的外部資料 最多一天前
    avatar: { stale: 30, revalidate: 43_200, expire: 86_400 },
    // 車站與路線幾乎不會變 舊的先給畫面 背景再更新 TDX 每分鐘只有 5 次 不能讓人等下一分鐘
    stations: { stale: 30, revalidate: 86_400, expire: 2_592_000 },
    // TDX 的公車班距 最多 30 分鐘前
    records: { stale: 30, revalidate: 900, expire: 1800 },
    // HoYoLAB 的角色 開拓月曆 終局戰績 活動日曆 躍遷紀錄 15 分鐘後背景重讀 隔很久才打開時先給最多 6 小時前的
    hoyolab: { stale: 30, revalidate: 900, expire: 21_600 },
    // Twitch 的開台時間表很少改 背景重讀的頻率同上 先給的最多 6 小時前
    schedule: { stale: 30, revalidate: 900, expire: 21_600 },
    // 天氣預報 15 分鐘後背景重讀 隔很久才打開時先給最多 6 小時前的 不用等氣象署
    forecast: { stale: 30, revalidate: 900, expire: 21_600 },
    // 空氣品質每小時更新 背景重讀的頻率同預報 先給的最多一小時前
    air: { stale: 30, revalidate: 900, expire: 3600 },
    // 天氣特報一分鐘後背景重讀 先給的最多一小時前 結束時間過了的畫面本來就不顯示
    warnings: { stale: 30, revalidate: 60, expire: 3600 },
    // 證交所與櫃買的收盤價一天更新一次 每小時看一次就能接到早上的更新
    quotes: { stale: 30, revalidate: 3600, expire: 21_600 },
  },
  // public 的檔名沒有雜湊 換圖要換檔名或等效期過 重新整理時不用一個個問伺服器
  // 要登入的 /images 與 /illustrations 由 proxy 驗過才加 不然導回登入頁的轉址也會被記住
  async headers() {
    return [{ source: "/icons/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] }];
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
