import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { ModuleInfo } from "../module";
import { CardErrorBoundary } from "./card-error-boundary";
import { FOCUS_FRAME } from "./focus-frame";
import { Icon } from "./icon";
import { CardHeader } from "./page-header";
import { SceneImage } from "./scene";

type HomeCardProps = {
  info: Pick<ModuleInfo, "id" | "name" | "href" | "icon" | "accent" | "homeOnly">;
  title: string;
  /** 內容還在讀時顯示 大小盡量跟內容一樣 載入完才不會跳動 */
  skeleton: ReactNode;
  /** 排欄寫在卡片自己身上 例如 col-span */
  className?: string;
  /** 標題列的背景圖 */
  art?: string;
  /** plain 沒有卡片外框 直接放在頁面上 bare 連標題列都由內容自己畫 */
  variant?: "card" | "plain" | "bare";
  children: ReactNode;
};

/**
 * 標題列先出現 內容各自串流 慢或出錯只影響這一張
 * 卡片一直都在 裡面的元素不見時焦點落在這裡
 */
export function HomeCard({ info, title, skeleton, className = "", art, variant = "card", children }: HomeCardProps) {
  const headingId = `home-${info.id}`;
  const body = (
    <CardErrorBoundary>
      <Suspense fallback={skeleton}>{children}</Suspense>
    </CardErrorBoundary>
  );
  const frame = { "aria-labelledby": headingId, "data-accent": info.accent, ...FOCUS_FRAME };
  if (variant === "bare") {
    return (
      <section {...frame} className={`@container min-w-0 ${className}`}>
        <h2 id={headingId} className="sr-only">
          {title}
        </h2>
        {body}
      </section>
    );
  }

  const header = (
    <CardHeader
      id={headingId}
      icon={<Icon src={info.icon} />}
      actions={
        // 只有首頁卡片的模組沒有自己的頁面可以去
        !info.homeOnly && (
          <Link href={info.href} className="card-header-link">
            {info.name}
            <Icon name="chevron-right" className="size-4" />
          </Link>
        )
      }
    >
      {title}
    </CardHeader>
  );
  return (
    <section {...frame} className={`stack @container min-w-0 ${variant === "card" ? "card" : ""} ${className}`}>
      {art ? (
        <div className="card-art scene">
          <SceneImage src={art} />
          {header}
        </div>
      ) : (
        header
      )}
      {body}
    </section>
  );
}
