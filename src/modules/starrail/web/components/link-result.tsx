"use client";

import { createContext, use, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ResultBanner } from "@/core/ui/form-message";

/** 連結好的結果：accountId 是 service 剛寫入的自己的那一列 */
export type LinkResult = { accountId: number; message: string; warning?: string };
type ShownResult = LinkResult & { seq: number };

const ShowLinkResultContext = createContext<(result: LinkResult) => void>(() => {});
const LinkResultContext = createContext<ShownResult | null>(null);

/** 表單在頁面最下面（還沒有帳號時是整頁的表單），結果卻要顯示在帳號分頁旁邊：包住整個帳號區，兩邊共用這一份 */
export function LinkResultProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<ShownResult | null>(null);
  // 頁面被 Activity 藏起來時清掉：回到這一頁不會看到上次的結果
  useLayoutEffect(() => () => setResult(null), []);
  const show = useCallback((next: LinkResult) => setResult((previous) => ({ ...next, seq: (previous?.seq ?? 0) + 1 })), []);
  return (
    <ShowLinkResultContext value={show}>
      <LinkResultContext value={result}>{children}</LinkResultContext>
    </ShowLinkResultContext>
  );
}

export function useShowLinkResult(): (result: LinkResult) => void {
  return use(ShowLinkResultContext);
}

/** 只在看著剛連結的帳號時顯示，切到別的帳號就收起來 */
export function shownLinkResult<T extends LinkResult>(result: T | null, accountId: number): T | null {
  return result?.accountId === accountId ? result : null;
}

/** 帳號分頁上方的結果；新的結果出現時焦點移過來：按鈕在頁面最下面，畫面與報讀器都要跟到這裡 */
export function LinkResultBanner({ accountId }: { accountId: number }) {
  const result = shownLinkResult(use(LinkResultContext), accountId);
  const ref = useRef<HTMLDivElement>(null);
  const focusedSeq = useRef(0);

  useEffect(() => {
    if (!result || focusedSeq.current === result.seq) return;
    focusedSeq.current = result.seq;
    ref.current?.focus();
  }, [result]);

  if (!result) return null;
  return (
    <div ref={ref} tabIndex={-1} className="stack rounded-xl">
      <LinkResultView result={result} />
    </div>
  );
}

/** 成功與提醒分成兩個橫幅：少了 ltmid_v2 的提醒用警告樣式，不混在成功訊息裡 */
export function LinkResultView({ result }: { result: LinkResult }) {
  return (
    <>
      <ResultBanner tone="success" title={result.message} />
      {result.warning && <ResultBanner tone="warning" title={result.warning} />}
    </>
  );
}
