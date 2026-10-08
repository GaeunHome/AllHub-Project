import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { formatTaipeiDateTime } from "@/core/time";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { PageHeader, SectionTitle } from "@/core/ui/page-header";
import { cachedAccounts, cachedRecentCheckins } from "../../service/cached";
import { AccountCard, AccountCardSkeleton, DailyNotePanel, DailyNoteSkeleton } from "../components/account-card";
import { LinkAccountForm } from "../components/link-account-form";

// 圖示、名稱、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
export function StarrailPage({ info }: { info: ModuleInfo }) {
  return (
    <div data-accent={info.accent} className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <PageHeader icon={info.icon && <Icon src={info.icon} />} title={info.name} subtitle={info.description} />
        <p className="notice">
          <Icon name="info" className="size-4" />
          資料來自 HoYoLAB 的非官方介面，HoYoLAB 改版時可能暫時失效；只用在自己的帳號上。
        </p>
        <LinkAccountForm />
      </section>

      <section>
        <SectionTitle icon="users">已連結的角色</SectionTitle>
        <Suspense fallback={<AccountCardSkeleton />}>
          <AccountList />
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <CheckinLogs />
      </Suspense>
    </div>
  );
}

async function AccountList() {
  await requireSession();
  const accounts = await cachedAccounts();
  if (accounts.length === 0) {
    return <EmptyState icon="sparkles" title="還沒有連結任何角色" hint="照上面的步驟貼上 cookie，就能看到開拓力和每日簽到" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account}>
          <Suspense fallback={<DailyNoteSkeleton />}>
            <DailyNotePanel account={account} />
          </Suspense>
        </AccountCard>
      ))}
    </div>
  );
}

const RESULT_LABEL = { success: "成功", already: "已簽過", failed: "失敗" } as Record<string, string>;
const RESULT_CHIP = { success: "chip chip-success", already: "chip chip-accent", failed: "chip chip-danger" } as Record<string, string>;

async function CheckinLogs() {
  await requireSession();
  const logs = await cachedRecentCheckins();
  if (logs.length === 0) return null;

  return (
    <section>
      <SectionTitle icon="calendar-check">最近簽到紀錄</SectionTitle>
      <ul className="card divide-y divide-line p-0 text-sm">
        {logs.map(({ log, nickname, uid }) => (
          <li key={log.id} className="flex flex-col gap-1.5 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`${RESULT_CHIP[log.result] ?? "chip"} shrink-0`}>{RESULT_LABEL[log.result] ?? log.result}</span>
              <span className="truncate font-semibold text-ink">{nickname ?? uid}</span>
              <time dateTime={log.createdAt.toISOString()} className="ml-auto shrink-0 text-xs whitespace-nowrap text-muted tabular-nums">
                {formatTaipeiDateTime(log.createdAt)}
              </time>
            </div>
            <p className="text-muted">
              累計天數 {log.totalSignDay ?? "—"}
              {log.message && ` · ${log.message}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
