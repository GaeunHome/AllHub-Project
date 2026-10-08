import Link from "next/link";
import { requireSession } from "@/core/auth";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatTwd } from "../../lib/money";
import { formatMonth, formatMonthShort, recentMonths, resolveMonth, taipeiMonth, type MonthKey } from "../../lib/month";
import { goalTotals, monthlySeries, type GoalTotal } from "../../lib/summary";
import { cachedEntryTotals, cachedGoals } from "../../service/cached";
import { monthHref, type SearchParams } from "./month-href";

const LAYOUT = "grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]";

type Point = { month: MonthKey; amount: number; percent: number };

export async function History({ searchParams }: { searchParams: SearchParams }) {
  await requireSession();
  const current = taipeiMonth(new Date());
  const selected = resolveMonth((await searchParams).month, current);
  const [goals, totals] = await Promise.all([cachedGoals(), cachedEntryTotals()]);

  return (
    <div className={LAYOUT}>
      <MonthlyChart series={monthlySeries(totals, recentMonths(current, 12))} selected={selected} />
      <GoalTotals rows={goalTotals(goals, totals)} />
    </div>
  );
}

// 第一根與最後兩根靠邊，提示框往內對齊才不會超出卡片
function tooltipAlign(index: number, count: number): string {
  if (index < 2) return "left-0";
  if (index >= count - 2) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

/** 單一數列的直條圖：只用主題點綴色；數值放在提示框與表格，不在每根柱子上標數字 */
function MonthlyChart({ series, selected }: { series: Point[]; selected: MonthKey }) {
  const total = series.reduce((sum, point) => sum + point.amount, 0);
  const max = Math.max(...series.map((point) => point.amount));

  return (
    <figure className="card flex min-w-0 flex-col gap-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-semibold text-ink">最近 12 個月每月存款</span>
        <span className="text-sm text-muted">
          合計 <span className="font-semibold text-ink tabular-nums">{formatTwd(total)}</span> · 每月平均{" "}
          <span className="font-semibold text-ink tabular-nums">{formatTwd(Math.round(total / series.length))}</span>
        </span>
      </figcaption>

      {total === 0 ? (
        <p className="text-sm text-muted">最近 12 個月還沒有存款紀錄，記下第一筆後這裡會畫出每月的長條圖。</p>
      ) : (
        <>
          <div>
            <p className="text-xs text-muted tabular-nums">最高 {formatTwd(max)}</p>
            <ol className="mt-1 grid h-44 grid-cols-12 border-y border-line">
              {series.map((point, index) => (
                <li key={point.month} className="flex min-w-0">
                  {/* 整欄都是可點的範圍，比柱子本身大，滑鼠或鍵盤都好選 */}
                  <Link
                    href={monthHref(point.month)}
                    scroll={false}
                    aria-current={point.month === selected ? "true" : undefined}
                    aria-label={`${formatMonth(point.month)}：${formatTwd(point.amount)}，查看這個月的紀錄`}
                    className="group flex w-full items-end justify-center rounded-t-lg px-0.5 transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft"
                  >
                    <span
                      className="relative w-full max-w-6 rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
                      style={{ height: `${point.percent}%` }}
                    >
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute bottom-full z-10 mb-1.5 hidden rounded-xl border border-line bg-surface-solid px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg group-hover:block group-focus-visible:block ${tooltipAlign(index, series.length)}`}
                      >
                        <span className="block font-semibold text-ink tabular-nums">{formatTwd(point.amount)}</span>
                        <span className="block text-muted">{formatMonth(point.month)}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <ol aria-hidden className="mt-1.5 grid grid-cols-12 text-center text-[0.6875rem] leading-tight text-muted">
              {series.map((point, index) => (
                <li key={point.month} className={point.month === selected ? "font-semibold text-ink" : undefined}>
                  {/* 手機上一欄不到 30px，只放月份數字才不會擠在一起 */}
                  <span className="sm:hidden">{Number(point.month.slice(5, 7))}</span>
                  <span className="hidden sm:inline">{formatMonthShort(point.month)}</span>
                  {(index === 0 || point.month.endsWith("-01")) && <span className="block">{point.month.slice(0, 4)}</span>}
                </li>
              ))}
            </ol>
          </div>

          <details className="disclosure text-sm">
            <summary>以表格檢視</summary>
            <table className="mt-2 w-full">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1.5 font-medium">月份</th>
                  <th className="py-1.5 text-right font-medium">存款</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line border-t border-line">
                {series.toReversed().map((point) => (
                  <tr key={point.month}>
                    <td className="py-1.5 text-ink-soft">{formatMonth(point.month)}</td>
                    <td className="py-1.5 text-right text-ink tabular-nums">{formatTwd(point.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  );
}

function GoalTotals({ rows }: { rows: GoalTotal[] }) {
  return (
    <section className="card flex min-w-0 flex-col gap-3">
      <h3 className="font-semibold text-ink">各項目累計</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">還沒有任何項目或紀錄。</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-2 py-2.5 text-sm">
              <span className="min-w-0 truncate text-ink-soft">{row.label}</span>
              {row.tag && <span className="chip shrink-0">{row.tag}</span>}
              <span className="ml-auto shrink-0 font-semibold text-ink tabular-nums">{formatTwd(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function HistorySkeleton() {
  return (
    <LoadingState label="載入歷史紀錄…" className={LAYOUT}>
      <div className="card flex flex-col gap-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
      <div className="card flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-4" />
        ))}
      </div>
    </LoadingState>
  );
}
