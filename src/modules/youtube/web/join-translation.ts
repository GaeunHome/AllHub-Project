import type { ContinueActionError, ContinueResult } from "./actions";

// 不依賴 React 觀看頁的翻譯面板各拿一份 按鈕與續翻迴圈共用

export type JoinResult = ContinueResult | ContinueActionError;

/**
 * 按下用我的 API Key 繼續翻譯後 續翻都帶 join 第一次成功才放下 別人正在翻也算
 * 伺服器在那次把影片加進保留清單 出錯時留著 之後成功時才加
 */
export type JoinFlag = {
  /** 按下用我的 API Key 繼續翻譯 */
  raise: () => void;
  /** 送出一次續翻 帶上目前的旗標 */
  send: (call: (join: boolean) => Promise<JoinResult>) => Promise<JoinResult>;
};

/**
 * onSaved 代表伺服器這次加進了保留清單
 * 續翻不重繪頁面 觀看頁靠它把頻道列的保留改成已保留
 */
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
