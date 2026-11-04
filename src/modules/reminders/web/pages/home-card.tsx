import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { HomeCard } from "@/core/ui/home-card";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { cachedReminders } from "../../service/cached";
import { AddReminder } from "../components/add-reminder";
import { ReminderList } from "../components/reminder-list";
import { remindersView } from "../reminders-view";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function RemindersHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="提醒與倒數" skeleton={<RemindersSkeleton />}>
      <RemindersSnapshot />
    </HomeCard>
  );
}

export async function RemindersSnapshot() {
  const user = await requireModule("reminders");
  const items = await cachedReminders(user.id);
  const view = remindersView(items, new Date());
  const { today, latest } = view;
  if (view.shown.length === 0) {
    return <EmptyState compact icon="calendar-clock" title="還沒有提醒" hint="記下重要的日子，首頁會倒數，到了通知你" action={<AddReminder today={today} latest={latest} empty />} />;
  }
  return (
    <>
      <ReminderList view={view} />
      <div className="flex justify-end">
        <AddReminder today={today} latest={latest} />
      </div>
    </>
  );
}

/** 卡片的標題列下面先畫三列 跟清單的列一樣高 */
function RemindersSkeleton() {
  return (
    <LoadingState label="載入提醒…" className="card-list">
      {["w-3/5", "w-2/5", "w-1/2"].map((width) => (
        <div key={width} className="card-row flex items-center gap-3">
          <Skeleton className="size-13 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={`h-4 ${width}`} />
            <Skeleton className="h-3.5 w-12" />
          </div>
        </div>
      ))}
    </LoadingState>
  );
}
