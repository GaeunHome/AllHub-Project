import type { BannerSummary } from "../lib/warps";

// 角色 光錐 常駐一直有 新手與聯動沒抽過就不佔位置
const ALWAYS_SHOWN: readonly number[] = [11, 12, 1];

export const hasRecords = ({ pity, fiveStars }: BannerSummary) => pity > 0 || fiveStars.length > 0;

export const shownBanners = (summaries: readonly BannerSummary[]) => summaries.filter((row) => ALWAYS_SHOWN.includes(row.banner.id) || hasRecords(row));

/** 沒指定時看第一個有紀錄的卡池 都沒有就是第一個 */
export function pickBanner(summaries: readonly BannerSummary[], requested: string | string[] | undefined): BannerSummary {
  const id = typeof requested === "string" ? Number(requested) : NaN;
  return summaries.find((row) => row.banner.id === id) ?? summaries.find(hasRecords) ?? summaries[0];
}

export const pityText = (summary: BannerSummary) => (hasRecords(summary) ? `已墊 ${summary.pity} 抽` : "還沒有紀錄");
