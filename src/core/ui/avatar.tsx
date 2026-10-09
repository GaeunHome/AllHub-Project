import { ExternalImage } from "./external-image";

/** 頭像只用這四種大小：xs 跟文字排在同一行、sm 清單與卡片、md 標題旁、lg 沒有預覽圖時的佔位 */
const SIZES = {
  xs: { className: "size-6 text-[0.6875rem]", pixels: 48 },
  sm: { className: "size-9 text-sm", pixels: 72 },
  md: { className: "size-12 text-lg", pixels: 96 },
  lg: { className: "size-16 text-2xl", pixels: 128 },
} as const;

export type AvatarSize = keyof typeof SIZES;

type AvatarProps = {
  /** 伺服器端先經過 externalAssetUrl()；null 或載入失敗時改顯示名稱的第一個字 */
  src: string | null;
  name: string;
  size: AvatarSize;
  /** 外框、變灰這類外觀，圖片與文字頭像共用；大小一律用 size */
  className?: string;
};

/** 頻道與主播的圓形頭像；名稱已經顯示在旁邊，所以圖片當裝飾（alt 空白）；圖片的像素是顯示大小的兩倍 */
export function Avatar({ src, name, size, className = "" }: AvatarProps) {
  const { className: sizeClass, pixels } = SIZES[size];
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <ExternalImage
      src={src}
      alt=""
      width={pixels}
      height={pixels}
      className={`shrink-0 rounded-full bg-accent-soft object-cover ${sizeClass} ${className}`}
      fallback={
        <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-ink ${sizeClass} ${className}`}>
          {initial}
        </span>
      }
    />
  );
}
