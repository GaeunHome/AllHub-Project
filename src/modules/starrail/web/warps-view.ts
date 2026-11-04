import { WARP_PAGE_SIZE, type BannerSummary, type FiveStar } from "../lib/warps";

// 角色 光錐 常駐一直有 新手與聯動沒抽過就不佔位置
const ALWAYS_SHOWN: readonly number[] = [11, 12, 1];

export const shownBanners = (summaries: readonly BannerSummary[]) => summaries.filter((row) => ALWAYS_SHOWN.includes(row.banner.id) || row.total > 0);

/** 沒指定時看第一個有紀錄的卡池 都沒有就是第一個 */
export function pickBanner(summaries: readonly BannerSummary[], requested: string | string[] | undefined): BannerSummary {
  const id = typeof requested === "string" ? Number(requested) : NaN;
  return summaries.find((row) => row.banner.id === id) ?? summaries.find((row) => row.total > 0) ?? summaries[0];
}

export const lastPage = (total: number) => Math.max(Math.ceil(total / WARP_PAGE_SIZE), 1);

export function pageFrom(raw: string | string[] | undefined, total: number): number {
  const page = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(page) && page >= 1 ? Math.min(page, lastPage(total)) : 1;
}

export function pityText({ total, pity, pityKnown }: BannerSummary): string {
  if (total === 0) return "還沒有紀錄";
  return pityKnown ? `已墊 ${pity} 抽` : `至少已墊 ${pity} 抽`;
}

export const pullsText = ({ pulls, partial }: FiveStar) => (partial ? `至少 ${pulls} 抽` : `${pulls} 抽`);
