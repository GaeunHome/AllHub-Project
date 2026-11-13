import { useEffect } from "react";
import { listenPageKeys } from "@/core/ui/popup-layer";
import { playerShortcut } from "./player-shortcuts";
import type { PlayerFullscreen } from "./use-player-fullscreen";

/** 劇院模式只在寬螢幕有作用 跟版面的 lg 斷點一樣 */
const THEATER_MEDIA = "(min-width: 64rem)";

/**
 * 鍵盤的 f 全螢幕 t 劇院模式 Esc 離開頁內全螢幕
 * 焦點在 iframe 裡時按鍵到不了這裡 彈出層開著時讓給它 Esc 只關掉它
 */
export function usePlayerShortcuts(fullscreen: PlayerFullscreen, toggleTheater: () => void) {
  // 每次算繪都重新掛上 拿到的一定是最新的狀態
  useEffect(() =>
    listenPageKeys((event) => {
      const shortcut = playerShortcut(event);
      if (shortcut === "fullscreen") {
        event.preventDefault();
        fullscreen.toggle();
      } else if (shortcut === "theater" && fullscreen.mode === "off" && window.matchMedia(THEATER_MEDIA).matches) {
        event.preventDefault();
        toggleTheater();
      } else if (shortcut === "exit" && fullscreen.mode === "pseudo") {
        event.preventDefault();
        fullscreen.exitPseudo();
      }
    }),
  );
}
