import type { BannerSummary } from "../../lib/warps";
import { pityText } from "../warps-view";

export function PityPanel({ summary }: { summary: BannerSummary }) {
  const { banner, pity, remaining, fiveStars, average } = summary;
  return (
    <section aria-label="保底進度" className="sr-panel stack p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-2xl font-bold text-ink">{pityText(summary)}</p>
        <p className="text-ink-soft">距離保底 {remaining} 抽</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-sr-gold" style={{ width: `${Math.min((pity / banner.hardPity) * 100, 100)}%` }} />
        </div>
        <span className="sr-num text-sm font-semibold text-ink-soft">
          {pity} / {banner.hardPity}
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <Stat label="五星" value={`${fiveStars.length} 個`} />
        <Stat label="平均" value={average === null ? "—" : `${average} 抽`} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="sr-num text-lg font-bold text-ink">{value}</dd>
    </div>
  );
}

export function FiveStarList({ summary }: { summary: BannerSummary }) {
  return (
    <section aria-labelledby="sr-five-stars" className="sr-panel stack p-5 sm:p-6">
      <h3 id="sr-five-stars" className="font-semibold text-ink">
        五星歷史
      </h3>
      {summary.fiveStars.length === 0 ? (
        <p className="text-ink-soft">紀錄裡還沒有五星</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {summary.fiveStars.map((star, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5">
              <span aria-hidden className="text-sr-gold">
                ★
              </span>
              <span className="min-w-0 flex-1 font-medium break-words text-ink">{star.name}</span>
              {star.lost && <span className="chip chip-warning">歪</span>}
              <span className="sr-num font-bold text-ink">{star.pulls} 抽</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
