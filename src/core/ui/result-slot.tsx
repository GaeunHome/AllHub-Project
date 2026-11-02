"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DialogMessage } from "./dialog";

type Report = (message: string | undefined, focus?: boolean) => void;

const ReportContext = createContext<Report>(() => {});

/** 把訊息留在外框 focus 是打開視窗的按鈕或那一列會不見 焦點要移到訊息 不掉到 body */
export const useResultReport = () => useContext(ReportContext);

/**
 * 卡片內容的外框 空狀態被換掉 那一列刪掉或搬位置時訊息還在
 * 不多包一層 清單才是卡片的直接子元素 card-list 的邊距才對
 */
export function ResultSlot({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<{ message?: string; focus?: boolean }>({});
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (result.message && result.focus) ref.current?.focus();
  }, [result]);
  // Activity 藏起首頁時清掉 回來時才不會留著上次的訊息
  useLayoutEffect(() => () => setResult({}), []);

  return (
    <ReportContext value={(message, focus) => setResult({ message, focus })}>
      {children}
      {/* 靠右 跟卡片底下的按鈕對齊 */}
      <DialogMessage message={result.message} ref={ref} className="flex justify-end" />
    </ReportContext>
  );
}
