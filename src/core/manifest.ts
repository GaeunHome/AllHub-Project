import type { MetadataRoute } from "next";

/** 加到主畫面時用的 圖示放 public/icons 沒登入也讀得到 */
export function manifest(): MetadataRoute.Manifest {
  return {
    name: "AllHub",
    short_name: "AllHub",
    description: "個人整合系統",
    lang: "zh-Hant",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icons/app/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/app/512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/app/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
