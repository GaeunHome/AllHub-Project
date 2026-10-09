"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

/** 固定大小的圖給像素大小（先佔好位置）；填滿固定比例外框的圖用 fill，外框本身佔好位置、要是 relative */
type ImageSize = { width: number; height: number; fill?: never } | { fill: true; width?: never; height?: never };

type ExternalImageProps = ImageSize & {
  /** 伺服器端先經過 core/external-url 的 externalAssetUrl()；null 代表沒有圖 */
  src: string | null;
  alt: string;
  /** 畫面上的大小與外觀 */
  className?: string;
  /** 沒有網址或載入失敗時改顯示的內容，例如文字頭像 */
  fallback?: ReactNode;
};

// 平台 CDN 的圖片由瀏覽器直接載入：不經 Vercel 的圖片最佳化（免費方案有額度），也不帶 referrer，CDN 看不到是網站的哪一頁
export function ExternalImage({ src, alt, width, height, fill, className, fallback = null }: ExternalImageProps) {
  // 記下失敗的網址而不是布林值：網址換了（例如快取更新）就重新試一次
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return fallback;
  return (
    <Image
      src={src}
      alt={alt}
      {...(fill ? { fill: true } : { width, height })}
      className={className}
      unoptimized
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}
