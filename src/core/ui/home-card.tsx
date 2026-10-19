import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { ModuleInfo } from "../module";
import { CardErrorBoundary } from "./card-error-boundary";
import { Icon } from "./icon";
import { CardHeader } from "./page-header";

type HomeCardProps = {
  info: Pick<ModuleInfo, "id" | "name" | "href" | "icon" | "accent" | "homeOnly">;
  title: string;
  /** 內容還在讀時顯示 大小盡量跟內容一樣 載入完才不會跳動 */
  skeleton: ReactNode;
  /** 排欄寫在卡片自己身上 例如 col-span */
  className?: string;
  children: ReactNode;
};

/**
 * 標題列不必等資料先出現 內容各自串流 慢或出錯都只影響這一張
 * 用 @container 讓內容依卡片本身的寬度排欄 超寬螢幕上有的卡片只佔半列
 */
export function HomeCard({ info, title, skeleton, className, children }: HomeCardProps) {
  const headingId = `home-${info.id}`;
  return (
    <section aria-labelledby={headingId} data-accent={info.accent} className={className ? `card stack @container min-w-0 ${className}` : "card stack @container min-w-0"}>
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
      <CardErrorBoundary>
        <Suspense fallback={skeleton}>{children}</Suspense>
      </CardErrorBoundary>
    </section>
  );
}
