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

export function elementColorClass(element: string | null): string {
  return (element && ELEMENT_COLORS[element]) || "bg-slate-500";
}

/** 屬性的小圓標：顏色加上中文第一個字，色盲也分得出來 */
export function ElementBadge({ element, className = "size-5 text-[0.625rem]" }: { element: string | null; className?: string }) {
  const label = elementLabel(element);
  if (!element || !label) return null;
  return (
    <span title={label} className={`grid shrink-0 place-items-center rounded-full font-bold text-white ring-1 ring-black/25 ${elementColorClass(element)} ${className}`}>
      {Array.from(label)[0]}
    </span>
  );
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
