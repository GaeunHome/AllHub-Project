"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DialogMessage } from "@/core/ui/dialog";
import { useRemovalNotice } from "../row-controls";

const NoticeContext = createContext<((message: string) => void) | null>(null);

/**
 * 這個月要做的事處理完那一列的按鈕會不見
 * 所以訊息放在外面這個不會消失的位置 焦點跟著移過來
 */
export function OverviewNotice({ children }: { children: ReactNode }) {
  const notice = useRemovalNotice();
  return (
    <NoticeContext value={notice.report}>
      <DialogMessage {...notice.messageProps} />
      {children}
    </NoticeContext>
  );
}

/** 外面沒有 OverviewNotice 時改用提示視窗 不會沒有回饋 */
export function useOverviewNotice(): (message: string) => void {
  return useContext(NoticeContext) ?? ((message) => window.alert(message));
}
