import { requireSession } from "@/core/auth";
import { FormMessage } from "@/core/ui/form-message";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { ledgerMonthOf } from "../../lib/ledger";
import { formatTaipeiTime } from "../../lib/responses";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedLedger } from "../../service/cached";
import { LedgerView } from "./ledger-view";

/** 開拓月曆：先查這個月，再一起查 HoYoLAB 給得到的其他月份（各自快取 30 分鐘），切換月份不必再等 */
export async function LedgerPanel({ account }: { account: StarrailAccountView }) {
  const user = await requireSession();
  const first = await cachedLedger(user.id, account.id, ledgerMonthOf(new Date()));
  if (!first.ok) {
    return (
      <section className="stack">
        <h3 className="sr-title">開拓月曆</h3>
        <FormMessage tone="error">{first.message}</FormMessage>
      </section>
    );
  }
  const others = await Promise.all(first.ledger.months.filter((month) => month !== first.ledger.month).map((month) => cachedLedger(user.id, account.id, month)));
  const ledgers = [first, ...others].flatMap((result) => (result.ok ? [result.ledger] : [])).sort((a, b) => a.month.localeCompare(b.month));
  return <LedgerView ledgers={ledgers} current={first.ledger.month} fetchedLabel={formatTaipeiTime(first.fetchedAt, new Date())} />;
}

export function LedgerSkeleton() {
  return (
    <LoadingState label="向 HoYoLAB 查詢開拓月曆…" className="stack">
      <h3 className="sr-title">開拓月曆</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-none" />
        <Skeleton className="h-28 rounded-none" />
      </div>
      <Skeleton className="h-48 rounded-none" />
    </LoadingState>
  );
}
