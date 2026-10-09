"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";

type CopyState = "idle" | "copied" | "failed";

/** 剪貼簿只能在 https 或 localhost 用，被瀏覽器拒絕時請使用者自己選取複製 */
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
    <button type="button" onClick={copy} className={className}>
      <Icon name={state === "copied" ? "check" : "copy"} className="size-4" />
      <span aria-live="polite">{state === "copied" ? "已複製" : state === "failed" ? "請手動選取複製" : label}</span>
    </button>
  );
}
