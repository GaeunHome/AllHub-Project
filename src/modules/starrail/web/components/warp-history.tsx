import { externalAssetUrl } from "@/core/external-url";
import { Avatar } from "@/core/ui/avatar";
import type { BannerSummary } from "../../lib/warps";
import { percentOf, pityText } from "../warps-view";

export function PityPanel({ summary }: { summary: BannerSummary }) {
  const { banner, pity, remaining, fiveStars, average } = summary;
  return (
    <section aria-label="保底進度" className="sr-panel stack p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <p className="text-3xl font-bold text-ink">{pityText(summary)}</p>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 sm:ml-auto">
          <Stat label="距離保底" value={`${remaining} 抽`} />
          <Stat label="平均" value={average === null ? "—" : `${average} 抽`} />
          <Stat label="五星" value={`${fiveStars.length} 個`} />
        </dl>
      </div>
      <div className="flex items-center gap-3">
        <div className="sr-warp-track flex-1">
          <div className="sr-warp-fill" style={{ width: percentOf(pity, banner.hardPity) }} />
        </div>
        <span className="sr-num text-sm font-semibold text-ink-soft">
          {pity} / {banner.hardPity}
        </span>
      </div>
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
  const { banner, fiveStars } = summary;
  return (
    <section aria-labelledby="sr-five-stars" className="sr-panel stack p-5 sm:p-6">
      <h3 id="sr-five-stars" className="font-semibold text-ink">
        五星歷史
      </h3>
      {fiveStars.length === 0 ? (
        <p className="text-ink-soft">紀錄裡還沒有五星</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {fiveStars.map((star, i) => (
            <li key={i} className="sr-warp-row">
              <Avatar src={externalAssetUrl(star.icon)} name={star.name} size="md" className="sr-warp-avatar" />
              <span className="sr-warp-name">
                <span className="min-w-0 font-semibold break-words text-ink">{star.name}</span>
                {star.lost && <span className="chip chip-warning shrink-0">歪</span>}
              </span>
              <span className="sr-warp-track sr-warp-bar">
                <span className="sr-warp-fill" style={{ width: percentOf(star.pulls, banner.hardPity) }} />
              </span>
              <span className="sr-num sr-warp-pulls font-bold text-ink">{star.pulls} 抽</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
