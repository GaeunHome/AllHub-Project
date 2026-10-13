"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { PLAYER_SIZE_INIT_SCRIPT, applyPlayerSize, readPlayerSize, subscribePlayerSize } from "../player-size";

const noSubscribe = () => () => {};

/** 放在觀看頁的播放器與骨架之前：劇院模式的偏好存在瀏覽器，靠 html 上的屬性讓整頁載入時第一次繪製（含骨架）就是劇院模式 */
export function PlayerSizeSync() {
  // 伺服器算繪與 hydration 時是 true：只有整頁載入時才需要腳本；瀏覽器端產生的 script 不會執行，React 還會警告
  const serverRendered = useSyncExternalStore(noSubscribe, () => false, () => true);

  // 站內換頁時骨架也在繪製前排好；之後跟著切換（含其他分頁），藏起來或卸載時拿掉，屬性不會留到別頁
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => applyPlayerSize(root, readPlayerSize());
    apply();
    const unsubscribe = subscribePlayerSize(apply);
    return () => {
      unsubscribe();
      applyPlayerSize(root, "default");
    };
  }, []);

  return serverRendered ? <script dangerouslySetInnerHTML={{ __html: PLAYER_SIZE_INIT_SCRIPT }} /> : null;
}
