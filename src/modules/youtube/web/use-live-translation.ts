import { useState } from "react";
import type { LiveUpdate } from "./components/watch-panel-parts";

type Live = { key: string; translated: (string | null)[]; translating: boolean };

/**
 * 翻譯中每批回來就更新 播放器可以先顯示翻好的部分
 * 伺服器端狀態換了 也就是 translationKey 變了 就改用伺服器給的資料
 */
export function useLiveTranslation(translationKey: string, serverTranslated: (string | null)[] | undefined, autoContinue: boolean) {
  const [live, setLive] = useState<Live | null>(null);
  const current = live?.key === translationKey ? live : null;

  const report = ({ translated: next, translating }: LiveUpdate) =>
    setLive((previous) => ({
      key: translationKey,
      translated: next ?? (previous?.key === translationKey ? previous.translated : (serverTranslated ?? [])),
      translating,
    }));

  return { translated: current?.translated ?? serverTranslated ?? [], translating: current?.translating ?? autoContinue, report };
}
