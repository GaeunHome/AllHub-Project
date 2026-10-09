import { Suspense } from "react";
import { requireSession } from "../auth";
import type { ModuleInfo } from "../module";
import { RETENTION_DAYS } from "../retention";
import { Icon } from "../ui/icon";
import { CardHeader, PageHeader } from "../ui/page-header";
import { LogListSkeleton } from "../ui/skeleton";
import { cachedNotificationCounts, cachedNotificationList } from "./cached";
import { NotificationList } from "./notification-list";
import type { NotificationModule } from "./notification-summary";
import { NotificationSettings } from "./settings";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 模組清單由 src/app 傳進來：core 不能 import 模組
export function NotificationsPage({ modules, searchParams }: { modules: ModuleInfo[]; searchParams: SearchParams }) {
  const notificationModules: NotificationModule[] = modules.map(({ id, name, icon, accent, notifies }) => ({ id, name, icon, accent, notifies }));

  return (
    <div className="page-stack">
      <PageHeader icon={<Icon name="bell" />} title="通知" actions={<span className="chip">保留最近 {RETENTION_DAYS} 天</span>} />

      <Suspense fallback={<LogListSkeleton rows={5} label="載入通知…" />}>
        <NotificationSection modules={notificationModules} searchParams={searchParams} />
      </Suspense>

      <section aria-labelledby="notification-settings" className="card stack">
        <CardHeader id="notification-settings" icon={<Icon name="settings" />}>
          提醒方式
        </CardHeader>
        <NotificationSettings modules={notificationModules} />
      </section>
    </div>
  );
}

async function NotificationSection({ modules, searchParams }: { modules: NotificationModule[]; searchParams: SearchParams }) {
  const user = await requireSession();
  const requested = (await searchParams).module;
  // 只接受認得的模組 id，網址被亂改時當成全部
  const selected = typeof requested === "string" && modules.some((m) => m.id === requested) ? requested : null;
  const [items, counts] = await Promise.all([cachedNotificationList(user.id, selected ?? undefined), cachedNotificationCounts(user.id)]);

  return <NotificationList items={items} moduleIds={Object.keys(counts)} module={selected} modules={modules} retentionDays={RETENTION_DAYS} />;
}
