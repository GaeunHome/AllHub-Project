"use client";

import { InfoTip } from "@/core/ui/info-tip";
import { formatTwd } from "../../../lib/money";
import { formatMonth, type MonthKey } from "../../../lib/month";
import type { AssetTrendPoint } from "../../../lib/trend";
import { assetChart } from "./asset-trend-model";
import { MonthChart } from "./month-chart";

/** 使用者選的疊起來的長條 下面是存款 上面是投資 頂端就是總資產 */
export function AssetTrendChart({ points, current }: { points: AssetTrendPoint[]; current: MonthKey }) {
  const chart = assetChart(points);
  return (
    <MonthChart
      title="資產走勢"
      actions={<InfoTip label="資產走勢的說明">存款照紀錄回推，投資沒記到市值的月份用買進成本</InfoTip>}
      points={points}
      current={current}
      scale={chart.scale}
      empty={chart.empty ? "還沒有存款或投資" : null}
      bars={(_, i) => {
        const column = chart.columns[i];
        return (
          <span className="fin-bar fin-bar-stack" style={{ height: `${column.height}%` }}>
            <span className="fin-bar-investment" style={{ flexGrow: column.investmentShare }} />
            <span className="fin-bar-deposit" style={{ flexGrow: column.depositShare }} />
          </span>
        );
      }}
      readout={(point) => <Readout point={point} />}
      label={(point) => `${formatMonth(point.month)}：總資產 ${formatTwd(point.total)}，存款 ${formatTwd(point.deposit)}，投資 ${formatTwd(point.investment)}${point.atCost ? "（照成本）" : ""}，查看這個月的紀錄`}
      table={{
        headers: ["總資產", "存款", "投資"],
        cells: (point) => [formatTwd(point.total), formatTwd(point.deposit), `${formatTwd(point.investment)}${point.atCost ? "（照成本）" : ""}`],
      }}
    />
  );
}

/** 平常只是圖例 滑過或鍵盤移到哪個月才寫金額 */
function Readout({ point }: { point: AssetTrendPoint | null }) {
  return (
    <p className="fin-readout">
      {point && (
        <span className="fin-readout-month">
          {formatMonth(point.month)} 總資產 <strong>{formatTwd(point.total)}</strong>
        </span>
      )}
      <span className="fin-readout-item">
        <span className="fin-key fin-key-deposit" aria-hidden="true" />
        存款{point && <strong>{formatTwd(point.deposit)}</strong>}
      </span>
      <span className="fin-readout-item">
        <span className="fin-key fin-key-investment" aria-hidden="true" />
        投資{point && <strong>{formatTwd(point.investment)}</strong>}
        {point?.atCost && "（照成本）"}
      </span>
    </p>
  );
}
