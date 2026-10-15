import type { Endgame } from "../lib/endgame";

/**
 * 上場隊伍的頭像換成瀏覽器載入用的網址 新增圖片欄位要一起加 測試會檢查
 * elementIcon 是內建的靜態檔 原樣保留
 */
export function endgameAssetUrls(endgame: Endgame, asset: (url: string | null) => string | null): Endgame {
  return {
    ...endgame,
    floors: endgame.floors.map((floor) => ({
      ...floor,
      nodes: floor.nodes.map((node) => ({ ...node, avatars: node.avatars.map((avatar) => ({ ...avatar, icon: asset(avatar.icon) })) })),
    })),
  };
}
