"use client";

import { InfoTip } from "@/core/ui/info-tip";
import { daysBetween, formatDay, formatSlashDate, type DateKey } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import { dateToMonth } from "../../../lib/month";
import type { AssetTrendPoint } from "../../../lib/trend";
import { monthRecordsHref } from "../../paths";
import { assetChart } from "./asset-trend-model";
import { BarChart, type ChartAxis } from "./bar-chart";

// 30 根時每一欄很窄 底下的日期從今天往回每 7 天寫一個
const LABEL_EVERY = 7;

/** 點一天到紀錄頁看那天的那個月 紀錄頁照月份篩 */
const dayAxis = (today: DateKey): ChartAxis<AssetTrendPoint> => ({
  key: (point) => point.day,
  tick: (point) => daysBetween(point.day, today) % LABEL_EVERY === 0 && <span className="fin-chart-day">{formatSlashDate(point.day)}</span>,
  current: (point) => point.day === today,
  href: (point) => monthRecordsHref(dateToMonth(point.day), dateToMonth(today)),
  heading: "日期",
  name: (point) => formatDay(point.day),
});

const investmentText = (point: AssetTrendPoint) => `${formatTwd(point.investment)}${point.atCost ? "（照成本）" : ""}`;

/** 使用者選的近 30 天每天一根疊起來的長條 下面是存款 上面是投資 頂端就是總資產 */
export function AssetTrendChart({ points, today }: { points: AssetTrendPoint[]; today: DateKey }) {
  const chart = assetChart(points);
  return (
    <BarChart
      title="資產走勢"
      actions={<InfoTip label="資產走勢的說明">近 30 天每天一根，存款照紀錄回推，投資沒記到市值的日子用買進成本</InfoTip>}
      points={points}
      axis={dayAxis(today)}
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
      label={(point) => `${formatDay(point.day)}：總資產 ${formatTwd(point.total)}，存款 ${formatTwd(point.deposit)}，投資 ${investmentText(point)}，查看這個月的紀錄`}
      table={{ headers: ["總資產", "存款", "投資"], cells: (point) => [formatTwd(point.total), formatTwd(point.deposit), investmentText(point)] }}
    />
  );
}

/** 平常只是圖例 滑過或鍵盤移到哪一天才寫金額 */
function Readout({ point }: { point: AssetTrendPoint | null }) {
  return (
    <p className="fin-readout">
      {point && (
        <span className="fin-readout-month">
          {formatDay(point.day)} 總資產 <strong>{formatTwd(point.total)}</strong>
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
