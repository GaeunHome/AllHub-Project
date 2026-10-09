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

type AutoContinueState = { active: boolean; apiKeyMissing: boolean; startedByViewer: boolean; consented: boolean };

/** 自己發起的翻譯打開觀看頁就接著翻；別人發起、還沒翻完的要觀看者自己按「用我的 API Key 繼續翻譯」才花他的錢（自動即時翻譯的開關只管自己開始新的翻譯） */
export function shouldAutoContinue({ active, apiKeyMissing, startedByViewer, consented }: AutoContinueState): boolean {
  return active && !apiKeyMissing && (startedByViewer || consented);
}
