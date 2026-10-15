import Link from "next/link";
import { Icon } from "@/core/ui/icon";
import { MIN_MONTH, addMonths, formatMonth, type MonthKey } from "../../lib/month";
import { monthHref, type MonthBasePath } from "./month-href";
import { MonthSelect } from "./month-select";

/**
 * 不能看未來的月份 所以在本月時停用下一月
 * 回到本月放最後 出現時箭頭才不會被推開 連按同一個位置還是同一顆箭頭
 */
export function MonthSwitcher({ month, current, options, basePath }: { month: MonthKey; current: MonthKey; options: MonthKey[]; basePath: MonthBasePath }) {
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);
  const arrow = "btn-secondary btn-icon";
  const disabled = `${arrow} cursor-not-allowed opacity-55`;

  return (
    <nav aria-label="切換月份" className="button-row">
      {previous >= MIN_MONTH ? (
        <Link href={monthHref(previous, basePath)} scroll={false} className={arrow} aria-label={`上一個月（${formatMonth(previous)}）`}>
          <Icon name="chevron-left" className="size-4" />
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          <Icon name="chevron-left" className="size-4" />
          <span className="sr-only">上一個月</span>
        </span>
      )}
      <MonthSelect value={month} options={options.map((m) => ({ value: m, label: formatMonth(m) }))} basePath={basePath} />
      {next <= current ? (
        <Link href={monthHref(next, basePath)} scroll={false} className={arrow} aria-label={`下一個月（${formatMonth(next)}）`}>
          <Icon name="chevron-right" className="size-4" />
        </Link>
      ) : (
        <span aria-disabled="true" title="還沒到下個月" className={disabled}>
          <Icon name="chevron-right" className="size-4" />
          <span className="sr-only">下一個月（還沒到）</span>
        </span>
      )}
      {month !== current && (
        <Link href={basePath} scroll={false} className="btn-ghost">
          回到本月
        </Link>
      )}
    </nav>
  );
}
