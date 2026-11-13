import Image from "next/image";
import type { ReactNode } from "react";
import { ExternalImage } from "@/core/ui/external-image";
import { groupDigits } from "@/core/number";
import { Icon } from "@/core/ui/icon";
import { elementLabel } from "../../lib/characters";

/**
 * 一關拿了幾顆星 label 是報讀器念的 例如王棋 3 顆星
 * boss 是異相仲裁的王棋星 跟一般的星分開顏色 另外有文字標明
 */
export function StarRow({ stars, label, tone = "gold", max = 3 }: { stars: number | null; label: string; tone?: "gold" | "boss"; max?: number }) {
  const earned = Math.max(0, Math.min(stars ?? 0, max));
  return (
    <span role="img" aria-label={`${label} ${earned} 顆星`} className={tone === "boss" ? "sr-stars sr-stars-boss" : "sr-stars"}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} aria-hidden data-on={i < earned ? "" : undefined}>
          ★
        </span>
      ))}
    </span>
  );
}

/** 用了幾回合 圖示加文字 不用小標籤 */
export function RoundCount({ rounds }: { rounds: number }) {
  return (
    <span className="flex items-center gap-1.5 text-ink">
      <Icon name="refresh-cw" className="size-4 text-sr-gold" />
      <span className="sr-num text-lg font-bold">{rounds}</span> 回合
    </span>
  );
}

/** 虛構敘事與末日幻影的分數 跟回合數一樣是圖示加文字 */
export function ScoreCount({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-1.5 text-ink">
      <Icon name="target" className="size-4 text-sr-gold" />
      <span className="sr-num text-lg font-bold">{groupDigits(score)}</span> 分
    </span>
  );
}

/** 末日幻影這一隊有沒有擊敗首領 不用小標籤 */
export function BossResult({ defeated }: { defeated: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-ink">
      <Icon name={defeated ? "circle-check" : "circle-alert"} className={defeated ? "size-4 text-sr-gold" : "size-4 text-[var(--sr-boss-star)]"} />
      {defeated ? "擊敗首領" : "未擊敗"}
    </span>
  );
}

export function QuickClear() {
  return (
    <span className="flex items-center gap-1 font-semibold text-[var(--sr-gold-ink)]">
      <Icon name="zap" className="size-4" />
      快速通關
    </span>
  );
}

/** 終局戰績與異相仲裁這一期沒有挑戰時 */
export function NoRecordNotice({ name }: { name: string | null }) {
  return (
    <p className="sr-panel flex items-center gap-3 p-5 text-ink sm:p-6">
      <Icon name="info" className="size-4 text-sr-gold" />
      這一期還沒有挑戰紀錄
      {name && <span>（{name}）</span>}
    </p>
  );
}

/** 伺服器與稀有度這類金色的標籤 */
export function GoldChip({ children }: { children: ReactNode }) {
  return <span className="chip border-[var(--sr-gold-line)] bg-[var(--sr-gold-soft)] text-[var(--sr-gold-ink)]">{children}</span>;
}

/** 稀有度的底色跟遊戲一樣 五星金 四星紫 */
export function rarityClass(rarity: number | null): string {
  if (rarity === 5) return "sr-five";
  if (rarity === 4) return "sr-four";
  return "bg-linear-to-b from-slate-600 to-slate-500";
}

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
  /** 內建屬性圖示的站內路徑 null 是認不得的屬性 */
  src: string | null;
  /** 大小與退回色圓時的字級 */
  className?: string;
  /** 旁邊已經寫了屬性名稱 報讀器不再念一次 */
  decorative?: boolean;
};

// 固定小圖示是靜態檔 跟官方標誌一樣用 next/image 載入
// 圖本來就小 不經圖片最佳化 也不走 ExternalImage

/** 屬性圖示 認不得的屬性退回灰色圓圈加名稱的第一個字 色盲也分得出來 */
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

/**
 * 命途與詞條這類裝飾用的小圖示 旁邊都有文字 沒有圖示時整個不畫
 * src 是內建圖示的站內路徑 className 是大小
 */
export function GameIcon({ src, className = "size-4" }: { src: string | null; className?: string }) {
  if (!src) return null;
  return <Image src={src} alt="" width={16} height={16} unoptimized className={`shrink-0 object-contain ${className}`} />;
}

type PortraitProps = {
  /** 伺服器端已經過 externalAssetUrl */
  src: string | null;
  name: string | null;
  element: string | null;
  className?: string;
  /** 沒有名字時改顯示的內容 */
  placeholder?: ReactNode;
};

/**
 * 填滿外框的角色圖 外框要是 relative 並決定大小
 * 讀不到時退回屬性色底加名字的第一個字 版面不會塌
 */
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
