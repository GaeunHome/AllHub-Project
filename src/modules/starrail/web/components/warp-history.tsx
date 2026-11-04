import Link from "next/link";
import { formatTaipeiDateTime } from "@/core/time";
import { warpsHref } from "../../lib/urls";
import type { BannerSummary, Warp } from "../../lib/warps";
import { lastPage, pityText, pullsText } from "../warps-view";

export function PityPanel({ summary }: { summary: BannerSummary }) {
  const { banner, total, pity, remaining, fiveStars, average } = summary;
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
        <Stat label="總抽數" value={String(total)} />
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
          {summary.fiveStars.map((star) => (
            <li key={star.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5">
              <span aria-hidden className="text-sr-gold">
                ★
              </span>
              <span className="min-w-0 flex-1 font-medium break-words text-ink">{star.name}</span>
              <span className="sr-num font-bold text-ink">{pullsText(star)}</span>
              <span className="text-sm text-ink-soft tabular-nums">{formatTaipeiDateTime(star.time)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type AllWarpsProps = { warps: Warp[]; total: number; page: number; accountId: number; bannerType: number };

/** 平常收著 換頁時保持打開 不然按了下一頁又收起來 */
export function AllWarps({ warps, total, page, accountId, bannerType }: AllWarpsProps) {
  const last = lastPage(total);
  return (
    <details open={page > 1} className="disclosure">
      <summary>全部抽卡（{total}）</summary>
      <ul className="flex flex-col divide-y divide-line">
        {warps.map((warp) => (
          <li key={warp.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
            <span className="min-w-0 flex-1 break-words text-ink">{warp.name}</span>
            {warp.itemType && <span className="text-sm text-ink-soft">{warp.itemType}</span>}
            <span aria-label={`${warp.rarity} 星`} className={`sr-num text-sm font-bold ${warp.rarity === 5 ? "text-sr-gold" : "text-ink-soft"}`}>
              {warp.rarity}★
            </span>
            <span className="text-sm text-ink-soft tabular-nums">{formatTaipeiDateTime(warp.time)}</span>
          </li>
        ))}
      </ul>
      {last > 1 && (
        <nav aria-label="全部抽卡的頁數" className="flex items-center justify-center gap-4 pt-3">
          {page > 1 ? (
            <Link href={warpsHref(accountId, bannerType, page - 1)} scroll={false} className="btn-secondary btn-sm">
              上一頁
            </Link>
          ) : (
            <span />
          )}
          <span className="sr-num text-sm text-ink-soft">
            {page} / {last}
          </span>
          {page < last ? (
            <Link href={warpsHref(accountId, bannerType, page + 1)} scroll={false} className="btn-secondary btn-sm">
              下一頁
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </details>
  );
}
