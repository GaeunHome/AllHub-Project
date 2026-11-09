import { Suspense, type ReactNode } from "react";
import { requireModule } from "@/core/auth";
import { hasTransitEnv } from "@/core/env";
import type { ModuleInfo } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { PageBanner } from "@/core/ui/page-banner";
import { SectionTitle } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { ROUTE_LIMIT } from "../../lib/rules";
import { cachedRoutes } from "../../service/cached";
import { RouteCard, TrackedCard } from "../components/route-cards";
import { SideSync, SideToggle } from "../components/side-toggle";
import { SortableRoutes } from "../components/sortable-routes";
import { loadBoards } from "../route-boards";
import { searchGate, whenOpen } from "../search-gate";
import { routeLabel } from "../transit-view";
import type { TransitRoute } from "../../data/schema";

// 使用者回報過切換交通工具很卡 我的路線放在 layout 只換網址參數時 Next 不重算
// 切換交通工具或查詢只重算左邊的查詢 不用等右邊的時刻表

const BANNER = "/images/scenes/banner-transit.svg";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function TransitLayout({ info, children }: { info: ModuleInfo; children: ReactNode }) {
  return (
    <div data-accent={info.accent} className="page-stack">
      <PageBanner
        image={BANNER}
        icon={<Icon src={info.icon} />}
        title={
          <span className="inline-flex items-center gap-1">
            交通
            <InfoTip label="交通的說明">資料來自交通部 TDX，票價是成人全票，捷運總時間是估的</InfoTip>
          </span>
        }
      />
      <Suspense fallback={<TransitSkeleton />}>
        <TransitFrame>{children}</TransitFrame>
      </Suspense>
    </div>
  );
}

export async function TransitFrame({ children }: { children: ReactNode }) {
  const user = await requireModule("transit");
  if (!hasTransitEnv()) return <EmptyState icon="bus" title="還沒設定交通資料的金鑰" hint="站長在 Vercel 的環境變數加上 TDX_CLIENT_ID 與 TDX_CLIENT_SECRET 就會顯示" />;
  const routes = await cachedRoutes(user.id);

  return (
    <div className="trn-layout">
      <div className="trn-main">{children}</div>
      {/* 手機上一眼要看到倒數 所以排在查詢前面 還沒有路線時空狀態不能擋在前面 */}
      <aside aria-labelledby="transit-side-title" data-empty={routes.length === 0 ? "" : undefined} className="trn-side no-scrollbar">
        <div className="trn-side-head">
          <h2 id="transit-side-title" className="trn-side-title">
            我的路線
          </h2>
          <SideToggle controls="transit-side-body" />
        </div>
        <div id="transit-side-body" className="trn-side-body">
          {/* TDX 每分鐘只有 5 次 查詢先問 卡片要等下一分鐘時表單已經能用 */}
          <Suspense fallback={<BoardsSkeleton />}>
            <RouteBoards routes={routes} now={new Date()} />
          </Suspense>
        </div>
      </aside>
      <SideSync />
    </div>
  );
}

async function RouteBoards({ routes, now }: { routes: TransitRoute[]; now: Date }) {
  await whenOpen(searchGate());
  const boards = await loadBoards(routes, now);
  const tracked = boards.filter((board) => board.route.tracked);
  const others = boards.filter((board) => !board.route.tracked);

  return (
    <>
      {tracked.length > 0 && (
        <section aria-labelledby="transit-tracked" className="stack">
          <SectionTitle id="transit-tracked">追蹤中</SectionTitle>
          <div className="trn-tracked">
            {tracked.map((board) => (
              <TrackedCard key={board.route.id} {...board} />
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="transit-routes" className="stack">
        <SectionTitle id="transit-routes">常用路線</SectionTitle>
        {routes.length === 0 ? (
          <EmptyState compact icon="bus" title="還沒有常用路線" hint="查到班次後按星星，就會存在這裡" />
        ) : (
          <SortableRoutes
            items={others.map((board) => ({ id: board.route.id, label: routeLabel(board.route), node: <RouteCard key={board.route.id} {...board} /> }))}
            after={
              routes.length < ROUTE_LIMIT && (
                <a href="#transit-search" className="trn-add">
                  <Icon name="plus" className="size-4" />
                  新增常用路線
                </a>
              )
            }
          />
        )}
      </section>
    </>
  );
}

function BoardsSkeleton() {
  return (
    <LoadingState label="載入常用路線…">
      <Skeleton className="h-40 rounded-2xl" />
    </LoadingState>
  );
}

function TransitSkeleton() {
  return (
    <LoadingState label="載入交通…" className="page-stack">
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </LoadingState>
  );
}
