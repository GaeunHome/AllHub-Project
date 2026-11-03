import { Suspense } from "react";
import { deniedModules, requireSession } from "../auth";
import type { ModuleInfo, SearchParams } from "../module";
import { RETENTION_DAYS } from "../retention";
import { Icon } from "../ui/icon";
import { CardHeader, PageHeader } from "../ui/page-header";
import { ListSkeleton, LogListSkeleton } from "../ui/skeleton";
import { cachedNotificationCounts, cachedNotificationList } from "./cached";
import { NotificationList } from "./notification-list";
import type { NotificationModule } from "./notification-summary";
import { UsableNotificationSettings } from "./usable-settings";

// core 不能 import 模組 所以模組清單由 src/app 傳進來
export function NotificationsPage({ modules, searchParams }: { modules: ModuleInfo[]; searchParams: SearchParams }) {
  const notificationModules: NotificationModule[] = modules.map(({ id, name, icon, accent, notifies }) => ({ id, name, icon, accent, notifies }));

  return (
    // 寬螢幕分兩欄 清單才不會拉到整個畫面寬
    <div className="page-stack xl:grid xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start xl:[&>:first-child]:col-span-2">
      <PageHeader icon={<Icon name="bell" />} title="通知" actions={<span className="chip">保留最近 {RETENTION_DAYS} 天</span>} />

      <Suspense fallback={<LogListSkeleton rows={5} label="載入通知…" />}>
        <NotificationSection modules={notificationModules} searchParams={searchParams} />
      </Suspense>

      <section aria-labelledby="notification-settings" className="card stack">
        <CardHeader id="notification-settings" icon={<Icon name="settings" />}>
          提醒方式
        </CardHeader>
        <Suspense fallback={<ListSkeleton rows={3} label="載入提醒方式…" />}>
          <UsableNotificationSettings modules={notificationModules} />
        </Suspense>
      </section>
    </div>
  );
}

export async function NotificationSection({ modules, searchParams }: { modules: NotificationModule[]; searchParams: SearchParams }) {
  const user = await requireSession();
  const denied = await deniedModules(user);
  const requested = (await searchParams).module;
  // 只接受認得而且能用的模組 id 網址被亂改時當成全部
  const selected = typeof requested === "string" && modules.some((m) => m.id === requested) && !denied.has(requested) ? requested : null;
  const [items, counts] = await Promise.all([cachedNotificationList(user.id, selected ?? undefined), cachedNotificationCounts(user.id)]);
  // 關掉的模組看不到 舊通知留在資料庫 恢復後照常顯示
  const visibleItems = items.filter((item) => !denied.has(item.module));
  const visibleIds = Object.keys(counts).filter((id) => !denied.has(id));

  return <NotificationList items={visibleItems} moduleIds={visibleIds} module={selected} modules={modules} retentionDays={RETENTION_DAYS} />;
}
