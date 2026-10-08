import type { Progress } from "../service/translation";
import type { ContinueActionError } from "./actions";

export type LoopResult = Progress | ContinueActionError;

/** 中途停下的原因；needsSettings 代表要到「翻譯設定」處理（畫面附上連結） */
export type LoopStop = { message: string; needsSettings: boolean };

export type LoopOptions = {
  call: (positionMs: number | undefined) => Promise<LoopResult>;
  /** 每次呼叫前才讀，使用者拖曳後下一次呼叫就用新位置 */
  position?: () => number | undefined;
  onProgress: (progress: Progress) => void;
  isCancelled: () => boolean;
  sleep?: (ms: number) => Promise<void>;
};

const BUSY_RETRY_MS = 3000;
/** 呼叫丟例外（斷網、504、部署後舊頁面找不到 Server Action）時的退避間隔；用完就停下，等使用者按「繼續翻譯」 */
const RETRY_DELAYS_MS = [2000, 5000, 10_000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 每次呼叫只翻一批（觀看中）或幾批，所以要連續呼叫；回傳 null 是正常結束（完成、失敗、離開頁面），回傳原因時畫面顯示訊息與「繼續翻譯」 */
export async function runTranslationLoop({ call, position, onProgress, isCancelled, sleep = wait }: LoopOptions): Promise<LoopStop | null> {
  let failures = 0;
  while (!isCancelled()) {
    let result: LoopResult;
    try {
      result = await call(position?.());
    } catch {
      if (failures >= RETRY_DELAYS_MS.length) {
        return { message: "連線中斷，翻譯暫停了。可以按「繼續翻譯」；一直失敗的話請重新整理頁面", needsSettings: false };
      }
      await sleep(RETRY_DELAYS_MS[failures++]);
      continue;
    }
    if (isCancelled()) break;
    failures = 0;
    if ("actionError" in result) return { message: result.actionError, needsSettings: Boolean(result.needsSettings) };

    onProgress(result);
    if (result.status === "done" || result.status === "failed") break;
    if (result.busy) await sleep(BUSY_RETRY_MS);
  }
  return null;
}
