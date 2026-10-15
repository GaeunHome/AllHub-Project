"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ActionButton } from "@/core/ui/action-button";
import { DialogMessage } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { setupAction } from "../../actions";
import { useRemovalNotice } from "../row-controls";

const SetupResultContext = createContext<((message: string) => void) | null>(null);

/**
 * 開始使用成功後整張卡片會被伺服器換掉
 * 所以包在卡片外面 訊息與焦點留在這個還在的位置
 */
export function SetupResultSlot({ children }: { children?: ReactNode }) {
  const notice = useRemovalNotice();
  return (
    <SetupResultContext value={notice.report}>
      <DialogMessage {...notice.messageProps} />
      {children}
    </SetupResultContext>
  );
}

/** 重按也不會重複建立 外面沒有 SetupResultSlot 時訊息改用提示視窗 */
export function SetupButton() {
  const report = useContext(SetupResultContext);
  const run = async () => {
    const result = await setupAction();
    if (!result.error && result.message) {
      if (report) report(result.message);
      // 按鈕會跟著卡片消失 訊息放卡片上看不到 跟 Twitch 與 YouTube 選單的刪除一樣
      else window.alert(result.message);
    }
    return result;
  };

  return (
    <ActionButton
      action={run}
      fields={{}}
      formClassName="flex shrink-0 flex-col items-start gap-1"
      pendingLabel={
        <>
          <Icon name="loader-circle" className="size-4 animate-spin motion-reduce:animate-none" />
          建立中…
        </>
      }
      className="btn-primary"
    >
      <Icon name="sparkles" className="size-4" />
      開始使用
    </ActionButton>
  );
}
