import { createLocalPref } from "@/core/ui/local-pref";

/** 照 YouTube 一般大小右邊是接下來播放 劇院模式在寬螢幕撐滿內容寬度 */
export type PlayerSize = "default" | "theater";

const KEY = "allhub:youtube:player-size";

const playerSize = createLocalPref<PlayerSize>({
  key: KEY,
  defaultValue: "default",
  parse: (stored) => (stored === "default" || stored === "theater" ? stored : undefined),
});

export const readPlayerSize = playerSize.read;

export const savePlayerSize = playerSize.save;

export const subscribePlayerSize = playerSize.subscribe;

export function usePlayerSize(): [PlayerSize, (size: PlayerSize) => void] {
  return [playerSize.useValue(), playerSize.save];
}

/**
 * 劇院模式時標在 html 上 伺服器讀不到瀏覽器裡的偏好 元件一開始是一般大小
 * globals.css 依它先排成劇院模式
 */
export const THEATER_ATTRIBUTE = "data-youtube-theater";

// 放在播放器與骨架之前的同步腳本 第一次繪製前就標好 其他值一律當成一般大小
export const PLAYER_SIZE_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(KEY)})==="theater")document.documentElement.setAttribute(${JSON.stringify(THEATER_ATTRIBUTE)},"")}catch(e){}})()`;

type Root = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

export function applyPlayerSize(root: Root, size: PlayerSize): void {
  if (size === "theater") root.setAttribute(THEATER_ATTRIBUTE, "");
  else root.removeAttribute(THEATER_ATTRIBUTE);
}
