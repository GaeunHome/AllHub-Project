import type { Endgame, TeamMember } from "../lib/endgame";
import type { Peak, PeakStage } from "../lib/peak";

type Asset = (url: string | null) => string | null;

// elementIcon 是內建的靜態檔 原樣保留
const team = (avatars: TeamMember[], asset: Asset): TeamMember[] => avatars.map((avatar) => ({ ...avatar, icon: asset(avatar.icon) }));

const withIcon = <T extends { icon: string | null }>(value: T | null, asset: Asset): T | null => value && { ...value, icon: asset(value.icon) };

/** 上場隊伍的頭像 首領與增益的圖換成瀏覽器載入用的網址 新增圖片欄位要一起加 測試會檢查 */
export function endgameAssetUrls(endgame: Endgame, asset: Asset): Endgame {
  return {
    ...endgame,
    floors: endgame.floors.map((floor) => ({
      ...floor,
      nodes: floor.nodes.map((node) => ({ ...node, avatars: team(node.avatars, asset), boss: withIcon(node.boss, asset), buff: withIcon(node.buff, asset) })),
    })),
  };
}

const stage = <S extends PeakStage>(value: S, asset: Asset): S => ({ ...value, icon: asset(value.icon), avatars: team(value.avatars, asset) });

/** 異相仲裁的主題圖 評級勳章 首領 騎士 增益與頭像 新增圖片欄位要一起加 */
export function peakAssetUrls(peak: Peak, asset: Asset): Peak {
  return {
    seasons: peak.seasons.map((season) => ({
      ...season,
      theme: asset(season.theme),
      boss: { ...stage(season.boss, asset), medal: asset(season.boss.medal), buff: withIcon(season.boss.buff, asset) },
      knights: season.knights.map((knight) => stage(knight, asset)),
    })),
  };
}
