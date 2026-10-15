import type { CSSProperties, ReactNode } from "react";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { AnimatedNumber } from "../motion/animated-number";
import { KPI_GRID } from "./layout";

export type Kpi = {
  id: string;
  label: string;
  icon: UiIconName;
  value: number;
  /** 數字下面的小標籤 例如月底 投資賺賠 提醒 */
  note?: ReactNode;
  /** 手機上兩欄時佔滿一整列 給總資產用 */
  wide?: boolean;
};

/** 卡片依 --i 依序淡入 數字從 0 往上數 */
export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <dl className={KPI_GRID}>
      {items.map((item, i) => (
        <div key={item.id} className={`card fin-rise flex min-w-0 flex-col gap-2 @container ${item.wide ? "col-span-2 lg:col-span-1" : ""}`} style={{ "--i": i } as CSSProperties}>
          <dt className="flex items-center gap-2 text-sm font-medium text-ink-soft">
            <Icon name={item.icon} className="size-4 text-accent" />
            {item.label}
          </dt>
          {/* 數字依卡片寬度放大 手機兩欄時八位數也放得下 */}
          <dd className="text-xl font-bold tracking-tight text-ink tabular-nums @3xs:text-2xl">
            <AnimatedNumber value={item.value} />
          </dd>
          {item.note && <dd className="flex flex-wrap gap-1.5">{item.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
