import Link from "next/link";
import { requireSession } from "@/core/auth";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatTwd } from "../../lib/money";
import { formatMonth, formatMonthShort, recentMonths, resolveMonth, taipeiMonth, type MonthKey } from "../../lib/month";
import { goalTotals, monthlySeries, summarize, type GoalTotal } from "../../lib/summary";
import { cachedEntryTotals, cachedGoals } from "../../service/cached";
import { monthHref, type SearchParams } from "./month-href";
import { AmountTile } from "./month-progress";

// 兩欄等寬：長條圖與各項目累計並排時一樣大
const PANELS = "grid gap-4 lg:grid-cols-2";
const PANEL = "panel-outline stack min-w-0";

type Point = { month: MonthKey; amount: number; percent: number };

/** 今年與全部累計、最近 12 個月的長條圖、各項目累計；一律以台北時間的這個月計算，不受上面切換的月份影響（只標出選到的那根） */
export async function Statistics({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession();
  const current = taipeiMonth(new Date());
  const selected = resolveMonth((await searchParams).month, current);
  const [goals, totals] = await Promise.all([cachedGoals(user.id), cachedEntryTotals(user.id)]);
  const summary = summarize(goals, totals, current);

  return (
    <div className="stack">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AmountTile icon="calendar" label={`${current.slice(0, 4)} 年累計`} amount={summary.thisYear} />
        <AmountTile icon="piggy-bank" label="全部累計" amount={summary.allTime} />
      </dl>
      <div className={PANELS}>
        <MonthlyChart series={monthlySeries(totals, recentMonths(current, 12))} selected={selected} />
        <GoalTotals rows={goalTotals(goals, totals)} />
      </div>
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
    <figure className={PANEL}>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="font-semibold text-ink">最近 12 個月</span>
        <span className="text-sm text-ink-soft">
          合計 <span className="font-semibold text-ink tabular-nums">{formatTwd(total)}</span> · 每月平均{" "}
          <span className="font-semibold text-ink tabular-nums">{formatTwd(Math.round(total / series.length))}</span>
        </span>
      </figcaption>

      {total === 0 ? (
        <p className="text-ink">最近 12 個月還沒有存款紀錄。</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="text-right text-xs text-ink-soft tabular-nums">最高 {formatTwd(max)}</p>
            <ol className="grid h-44 grid-cols-12 border-y border-line">
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
                        <span className="block text-ink-soft">{formatMonth(point.month)}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <ol aria-hidden className="grid grid-cols-12 text-center text-xs leading-tight text-ink-soft">
              {series.map((point, index) => (
                <li key={point.month} className={point.month === selected ? "font-semibold text-ink" : undefined}>
                  {/* 一欄不到 30px 時只放月份數字才不會擠在一起 */}
                  <span className="sm:hidden">{Number(point.month.slice(5, 7))}</span>
                  <span className="hidden sm:inline">{formatMonthShort(point.month)}</span>
                  {(index === 0 || point.month.endsWith("-01")) && <span className="block">{point.month.slice(0, 4)}</span>}
                </li>
              ))}
            </ol>
          </div>

          <details className="disclosure text-sm">
            <summary>以表格檢視</summary>
            <table className="w-full">
              <thead className="text-left text-ink-soft">
                <tr>
                  <th className="py-1.5 font-medium">月份</th>
                  <th className="py-1.5 text-right font-medium">存款</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line border-t border-line">
                {series.toReversed().map((point) => (
                  <tr key={point.month}>
                    <td className="py-1.5 text-ink">{formatMonth(point.month)}</td>
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
    <section className={PANEL}>
      <h3 className="font-semibold text-ink">各項目累計</h3>
      {rows.length === 0 ? (
        <p className="text-ink">還沒有任何項目或紀錄。</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.key} className="flex min-h-11 items-center gap-2">
              <span className="min-w-0 truncate text-ink">{row.label}</span>
              {row.tag && <span className="chip shrink-0">{row.tag}</span>}
              <span className="ml-auto shrink-0 text-right font-semibold text-ink tabular-nums">{formatTwd(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StatisticsSkeleton() {
  return (
    <LoadingState label="載入統計…" className="stack">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <div className={PANELS}>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </LoadingState>
  );
}
