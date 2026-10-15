"use client";

import { useId, useState } from "react";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import type { AssetGrouping, Slice } from "../../../lib/ledger";
import { excludedNote } from "../../dashboard-view";
import { toggleSelection } from "./chart-focus";
import { DonutChart } from "./donut-chart";
import { Segmented } from "../segmented";

const GROUPINGS = [
  { id: "purpose", label: "依用途" },
  { id: "account", label: "依帳戶" },
] as const satisfies readonly { id: AssetGrouping; label: string }[];

/** 餘額是負的帳戶 圓餅圖只畫正的 這些寫在圖下面 */
export type ExcludedAccount = { name: string; balance: number };

type AssetDonutCardProps = { title: string; byPurpose: Slice[]; byAccount: Slice[]; excluded: ExcludedAccount[] };

/**
 * 切換分組時同一組圓弧用 CSS transition 換長度與顏色 不重新掛載
 * 中間的合計不含負餘額 跟總資產的淨值不同 所以寫出沒算進去的帳戶
 */
export function AssetDonutCard({ title, byPurpose, byAccount, excluded }: AssetDonutCardProps) {
  const [grouping, setGrouping] = useState<AssetGrouping>("purpose");
  const [selected, setSelected] = useState<string | null>(null);
  const headingId = useId();
  // 兩種分組是同一批帳戶 合計一樣
  const total = byPurpose.reduce((sum, slice) => sum + slice.amount, 0);

  return (
    <section aria-labelledby={headingId} className="card stack @container min-w-0">
      <CardHeader
        id={headingId}
        icon={<Icon name="chart-pie" />}
        actions={
          <Segmented
            label={`${title}的分組方式`}
            options={GROUPINGS}
            value={grouping}
            onChange={(next) => {
              setGrouping(next);
              setSelected(null);
            }}
            fill={false}
          />
        }
      >
        {title}
      </CardHeader>
      <DonutChart
        label={title}
        slices={grouping === "purpose" ? byPurpose : byAccount}
        arcCount={Math.max(byPurpose.length, byAccount.length)}
        center={{ label: "資產合計", amount: total }}
        selected={selected}
        onSelect={(key) => setSelected((current) => toggleSelection(current, key))}
      />
      {excluded.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-ink">
          {/* 跟第一行字一樣高 說明換行時圖示仍對齊第一行 */}
          <span className="flex h-5 shrink-0 items-center">
            <Icon name="info" className="size-4 text-ink-soft" />
          </span>
          <span className="tabular-nums">{excludedNote(excluded)}</span>
        </p>
      )}
    </section>
  );
}
