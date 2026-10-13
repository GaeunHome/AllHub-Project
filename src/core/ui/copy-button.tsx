"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";

type CopyState = "idle" | "copied" | "failed";

const STATUS_TEXT: Record<CopyState, string> = { idle: "", copied: "已複製", failed: "請手動選取複製" };

/** 剪貼簿只能在 https 或 localhost 用，被瀏覽器拒絕時請使用者自己選取複製；回傳按鈕與旁邊的結果，外層用 button-row 排成一列 */
export function CopyButton({ text, label = "複製", className = "btn-secondary btn-sm" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => setState("copied"),
      () => setState("failed"),
    );

  return (
    <>
      {/* 按鈕的字不變：焦點上的按鈕改名時，有的報讀器會再念一次結果 */}
      <button type="button" onClick={copy} className={className}>
        <Icon name={state === "copied" ? "check" : "copy"} className="size-4" />
        {label}
      </button>
      {/* 一開始就放在文件裡（之後才加進來的 live region 不會被念出來），也不包在別的 live region 裡 */}
      <span role="status" className={state === "failed" ? "text-sm text-danger" : "text-sm text-success"}>
        {STATUS_TEXT[state]}
      </span>
    </>
  );
}
