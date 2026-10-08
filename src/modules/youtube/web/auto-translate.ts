import { createLocalPref, onOff } from "@/core/ui/local-pref";

const autoTranslate = createLocalPref({ key: "allhub:youtube:auto-translate", defaultValue: true, ...onOff });

export const readAutoTranslate = autoTranslate.read;

export const saveAutoTranslate = autoTranslate.save;

export function useAutoTranslate(): [boolean, (on: boolean) => void] {
  return [autoTranslate.useValue(), autoTranslate.save];
}

type AutoStartState = { enabled: boolean; hasTranslation: boolean; apiKeyMissing: boolean; attempted: boolean; pending: boolean };

/** 只有使用者在觀看頁按下播放時才自動開始，而且只試一次：抓不到字幕時改等使用者上傳或手動重試，不要每按一次播放就重抓 */
export function shouldAutoStart({ enabled, hasTranslation, apiKeyMissing, attempted, pending }: AutoStartState): boolean {
  return enabled && !hasTranslation && !apiKeyMissing && !attempted && !pending;
}
