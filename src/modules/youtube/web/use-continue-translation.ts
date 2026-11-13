import { useEffect } from "react";
import type { Progress } from "../service/translation";
import { continueTranslationAction } from "./actions";
import type { JoinFlag } from "./join-translation";
import { runTranslationLoop, type LoopStop } from "./translation-loop";

type Options = {
  videoId: string;
  /** 自己發起的或觀看者已經按過繼續翻譯 才接著翻 */
  autoContinue: boolean;
  /** 每按一次繼續翻譯加一 讓迴圈重新開始 */
  run: number;
  join: JoinFlag;
  position: () => number;
  onProgress: (progress: Progress) => void;
  onStop: (stop: LoopStop) => void;
};

/**
 * 連續呼叫直到完成或失敗 離開頁面就停
 * 沒有自己的 API Key 或還沒決定要不要接著翻別人的 就只看翻好的部分
 */
export function useContinueTranslation({ videoId, autoContinue, run, join, position, onProgress, onStop }: Options) {
  useEffect(() => {
    if (!autoContinue) return;
    let cancelled = false;
    // 開發模式的 StrictMode 會掛載兩次 延到下一輪才開始
    // 免得第一個迴圈的譯文被丟掉 排隊的呼叫也不會帶著過時的播放位置
    const timer = setTimeout(() => {
      runTranslationLoop({
        call: (positionMs) => join.send((joining) => continueTranslationAction(videoId, positionMs, joining)),
        position,
        onProgress,
        isCancelled: () => cancelled,
      }).then((stop) => {
        if (cancelled || !stop) return;
        onStop(stop);
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 回呼與 position 每次渲染都是新函式，放進依賴會讓迴圈重啟
  }, [videoId, run, autoContinue]);
}
