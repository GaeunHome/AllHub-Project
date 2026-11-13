import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { fullscreenMode, fullscreenToggle, leaveFullscreen, lockPageScroll, type FullscreenMode } from "./player-fullscreen";

export type PlayerFullscreen = { mode: FullscreenMode; toggle: () => void; exitPseudo: () => void };

/** 能用 Fullscreen API 就讓外框連字幕一起全螢幕 iPhone 不能用或被拒絕時改用頁內全螢幕 */
export function usePlayerFullscreen(frameRef: RefObject<HTMLDivElement | null>): PlayerFullscreen {
  const [native, setNative] = useState(false);
  const [pseudo, setPseudo] = useState(false);

  useEffect(() => {
    // 以瀏覽器為準 按 Esc 切分頁或旋轉螢幕後都重新對一次 畫面不會卡在半全螢幕
    const sync = () => setNative(document.fullscreenElement !== null && document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("resize", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", sync);
    };
  }, [frameRef]);

  // 頁內全螢幕時 html 不捲動 清除函式在收起 卸載或頁面被藏起來時立刻解除
  useLayoutEffect(() => (pseudo ? lockPageScroll(document.documentElement) : undefined), [pseudo]);

  // 卸載或被 Activity 藏起來時一定離開全螢幕
  // 藏起來收不到 fullscreenchange 回來時按鈕會對不上
  useLayoutEffect(() => {
    const frame = frameRef.current;
    return () => {
      leaveFullscreen(document, frame);
      setNative(false);
      setPseudo(false);
    };
  }, [frameRef]);

  const toggle = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const action = fullscreenToggle(fullscreenMode({ native: document.fullscreenElement === frame, pseudo }), document.fullscreenEnabled === true);
    // 瀏覽器拒絕時退回頁內全螢幕 例如嵌在不允許全螢幕的頁面裡 照樣看得到字幕
    if (action === "enter-native") frame.requestFullscreen({ navigationUI: "hide" }).catch(() => setPseudo(true));
    else if (action === "exit-native") document.exitFullscreen().catch(() => {});
    else setPseudo(action === "enter-pseudo");
  };

  return { mode: fullscreenMode({ native, pseudo }), toggle, exitPseudo: () => setPseudo(false) };
}
