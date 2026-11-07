"use client";

import { useHtmlFlagSync, type HtmlRoot } from "@/core/ui/html-flag";
import { PLAYER_SIZE_INIT_SCRIPT, applyPlayerSize, readPlayerSize, subscribePlayerSize } from "../player-size";

const THEATER_SYNC = {
  script: PLAYER_SIZE_INIT_SCRIPT,
  apply: (root: HtmlRoot) => applyPlayerSize(root, readPlayerSize()),
  subscribe: subscribePlayerSize,
  clear: (root: HtmlRoot) => applyPlayerSize(root, "default"),
};

/**
 * 放在觀看頁的播放器與骨架之前 劇院模式的偏好存在瀏覽器
 * 靠 html 上的屬性讓整頁載入時第一次繪製就是劇院模式 骨架也是
 */
export function PlayerSizeSync() {
  return useHtmlFlagSync(THEATER_SYNC);
}
