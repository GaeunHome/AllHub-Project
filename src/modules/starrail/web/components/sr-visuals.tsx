import Image from "next/image";
import type { ReactNode } from "react";
import { ExternalImage } from "@/core/ui/external-image";
import { elementLabel } from "../../lib/characters";

/** 稀有度的底色跟遊戲一樣：五星金、四星紫 */
export function rarityClass(rarity: number | null): string {
  if (rarity === 5) return "sr-five";
  if (rarity === 4) return "sr-four";
  return "bg-linear-to-b from-slate-600 to-slate-500";
}

/** 遊戲的屬性色：物理灰、火紅、冰青、雷紫、風綠、量子靛、虛數金 */
const ELEMENT_COLORS: Record<string, string> = {
  physical: "bg-[#8a93a6]",
  fire: "bg-[#e5484d]",
  ice: "bg-[#2fb3e6]",
  lightning: "bg-[#a259e6]",
  wind: "bg-[#2fbf8f]",
  quantum: "bg-[#5b5bd6]",
  imaginary: "bg-[#d9aa1e]",
};

function elementColorClass(element: string | null): string {
  return (element && ELEMENT_COLORS[element]) || "bg-slate-500";
}

type ElementBadgeProps = {
  element: string | null;
  /** 內建屬性圖示的站內路徑（lib/game-icons.ts），null 是認不得的屬性 */
  src: string | null;
  /** 大小（size-*）與退回色圓時的字級 */
  className?: string;
  /** 旁邊已經寫了屬性名稱：報讀器不再念一次 */
  decorative?: boolean;
};

// 遊戲的固定小圖示是 public/ 裡的靜態檔：跟頁面上方的官方標誌一樣用 next/image 直接載入，不經 Vercel 的圖片最佳化（圖本來就小），也不走外部圖片的 ExternalImage

/** 屬性圖示：遊戲裡的屬性圖；認不得的屬性（沒有圖示）退回圓圈加名稱的第一個字（沒有屬性色，是灰色），色盲也分得出來 */
export function ElementBadge({ element, src, className = "size-5 text-[0.625rem]", decorative = false }: ElementBadgeProps) {
  const label = elementLabel(element);
  if (!element || !label) return null;
  return (
    <span {...(decorative ? { "aria-hidden": true } : { title: label, role: "img", "aria-label": label })} className={`relative grid shrink-0 place-items-center ${className}`}>
      {src ? (
        <Image src={src} alt="" fill unoptimized className="object-contain drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]" />
      ) : (
        <span aria-hidden className={`grid size-full place-items-center rounded-full font-bold text-white ring-1 ring-black/25 ${elementColorClass(element)}`}>
          {Array.from(label)[0]}
        </span>
      )}
    </span>
  );
}

/** 裝飾用的小圖示（命途、面板與遺器詞條的屬性圖示）：旁邊都有文字，沒有圖示時整個不畫、不佔位；src 是內建圖示的站內路徑，className 是大小（size-*） */
export function GameIcon({ src, className = "size-4" }: { src: string | null; className?: string }) {
  if (!src) return null;
  return <Image src={src} alt="" width={16} height={16} unoptimized className={`shrink-0 object-contain ${className}`} />;
}

type PortraitProps = {
  /** 伺服器端已經過 externalAssetUrl() */
  src: string | null;
  name: string | null;
  element: string | null;
  className?: string;
  /** 沒有名字時改顯示的內容 */
  placeholder?: ReactNode;
};

/** 填滿外框的角色圖（外框要是 relative、決定大小）；讀不到時退回屬性色底加名字的第一個字，版面不會塌 */
export function Portrait({ src, name, element, className = "", placeholder }: PortraitProps) {
  return (
    <ExternalImage
      src={src}
      alt=""
      fill
      className={`object-cover ${className}`}
      fallback={
        <span className={`absolute inset-0 grid place-items-center text-xl font-bold text-white ${elementColorClass(element)}`}>
          {name ? Array.from(name)[0] : placeholder}
        </span>
      }
    />
  );
}
