import type { Metadata, MetadataRoute } from "next";

// 個人用的網站不需要被搜尋到：robots.txt 請所有爬蟲都不要抓，每一頁也帶 noindex（src/app 的 robots.ts 與根版面只轉接這裡）

export function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}

/** 網址被別的地方連結時，robots.txt 擋不住收錄，要靠頁面上的 noindex */
export const NO_INDEX: NonNullable<Metadata["robots"]> = { index: false, follow: false };
