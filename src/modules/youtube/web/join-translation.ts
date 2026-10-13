import type { ContinueActionError, ContinueResult } from "./actions";

// 不依賴 React：觀看頁的翻譯面板各拿一份，按鈕與續翻迴圈共用

export type JoinResult = ContinueResult | ContinueActionError;

/** 「用我的 API Key 繼續翻譯」：按下後續翻的呼叫都帶 join，第一次成功（包括別人正在翻）後才放下，伺服器在那次成功時把影片加進他保留的影片；出錯時留著，處理好後按「繼續翻譯」成功時才加 */
export type JoinFlag = {
  /** 按下「用我的 API Key 繼續翻譯」 */
  raise: () => void;
  /** 送出一次續翻，帶上目前的旗標 */
  send: (call: (join: boolean) => Promise<JoinResult>) => Promise<JoinResult>;
};

/** onSaved：伺服器回報這次加進了保留的影片；續翻不重繪頁面，觀看頁靠它把頻道列的「保留」改成「已保留」 */
export function createJoinFlag(onSaved?: () => void): JoinFlag {
  let raised = false;
  return {
    raise: () => {
      raised = true;
    },
    send: async (call) => {
      const result = await call(raised);
      if (!("actionError" in result)) {
        raised = false;
        if (result.saved) onSaved?.();
      }
      return result;
    },
  };
}
