"use client";

import { useEffect, useState } from "react";

/** show 之後 ms 毫秒收起 連續出現時從最後一次重新計時 卸載時取消 */
export function useAutoHide(ms: number) {
  // 每次 show 加一 同樣的訊息再出現也會重新計時
  const [shown, setShown] = useState(0);
  const [hidden, setHidden] = useState(0);

  useEffect(() => {
    if (shown === 0) return;
    const timer = setTimeout(() => setHidden(shown), ms);
    return () => clearTimeout(timer);
  }, [shown, ms]);

  return { visible: shown !== hidden, show: () => setShown((count) => count + 1) };
}
