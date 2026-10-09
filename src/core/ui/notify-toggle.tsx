"use client";

import { useActionState, useOptimistic, startTransition } from "react";
import { InlineFeedback, type FormState } from "./form-message";
import { Icon } from "./icon";
import { notifyToggleFormData } from "./notify-toggle-form";

type NotifyToggleProps = {
  /** 模組的 Server Action：用 parseNotifyToggle 解析，自己負責 requireSession */
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  id: number;
  enabled: boolean;
  /** 給報讀器與提示文字用，例如主播或頻道名稱 */
  subject: string;
  /** menu：放在 ⋮ 選單裡的整列開關（文字加右側的開關圖示） */
  variant?: "button" | "menu";
};

/** 主播、頻道列表上的通知開關；先切換圖示再等伺服器，按下去立刻有反應 */
export function NotifyToggle({ action, id, enabled, subject, variant = "button" }: NotifyToggleProps) {
  const [shown, setShown] = useOptimistic(enabled);
  const [state, formAction, pending] = useActionState(action, {});

  const toggle = () => {
    const next = !shown;
    startTransition(() => {
      setShown(next);
      formAction(notifyToggleFormData(id, next));
    });
  };

  if (variant === "menu") {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" role="switch" aria-checked={shown} aria-label={`${subject} 的通知`} disabled={pending} onClick={toggle} className="menu-item">
          <Icon name={shown ? "bell" : "bell-off"} className="size-4" />
          <span className="flex-1">新影片通知</span>
          <span aria-hidden className="switch-visual" />
        </button>
        <InlineFeedback error={state.error} className="px-3" />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        aria-label={`${subject} 的通知`}
        title={shown ? "通知開啟中，點一下關閉" : "通知已關閉，點一下開啟"}
        disabled={pending}
        onClick={toggle}
        className={shown ? "btn-secondary btn-sm btn-icon sm:w-auto sm:px-3" : "btn-ghost btn-sm btn-icon text-muted sm:w-auto sm:px-3"}
      >
        <Icon name={shown ? "bell" : "bell-off"} className="size-4" />
        <span className="sr-only sm:not-sr-only">{shown ? "通知" : "靜音"}</span>
      </button>
      <InlineFeedback error={state.error} className="max-w-48 text-right" />
    </div>
  );
}
