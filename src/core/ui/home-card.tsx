import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { ModuleInfo } from "../module";
import { CardErrorBoundary } from "./card-error-boundary";
import { Icon } from "./icon";
import { CardHeader } from "./page-header";

type HomeCardProps = {
  info: Pick<ModuleInfo, "id" | "name" | "href" | "icon" | "accent">;
  title: string;
  /** 內容還在讀的時候顯示，大小盡量跟內容一樣，載入完不會跳動 */
  skeleton: ReactNode;
  children: ReactNode;
};

/** 首頁的卡片外框：標題列不必等資料先出現，內容各自串流；慢或出錯都只影響這一張 */
export function HomeCard({ info, title, skeleton, children }: HomeCardProps) {
  const headingId = `home-${info.id}`;
  return (
    <section aria-labelledby={headingId} data-accent={info.accent} className="card stack min-w-0">
      <CardHeader
        id={headingId}
        icon={info.icon ? <Icon src={info.icon} /> : <Icon name="sparkles" />}
        actions={
          <Link href={info.href} className="card-header-link">
            {info.name}
            <Icon name="chevron-right" className="size-4" />
          </Link>
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
